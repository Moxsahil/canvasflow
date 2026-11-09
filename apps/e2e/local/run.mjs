// Runs the Playwright suite against a complete stack on this machine.
//
//   pnpm --filter @canvasflow/e2e test:e2e:local [--skip-build] [playwright args…]
//
// What it starts, all on loopback and all torn down afterwards:
//   - a throwaway Postgres 17 with every repo migration applied
//   - a fake Resend API, so no email leaves the machine
//   - sync-server, api-gateway, the web app and the editor, built from this
//     checkout, on the ports in ../.env.test (never 3000–3002, so the dev
//     servers can keep running)
//
// Every service gets an explicit environment rather than this shell's, and
// none of them reads its own .env file, so nothing can reach Neon, Resend,
// R2, Polar or Anthropic.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createClient } from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';
import { startFakeResend } from './fake-resend.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const E2E = resolve(HERE, '..');
const ROOT = resolve(E2E, '../..');
const LOGS = join(HERE, 'logs');
const RESULTS = join(HERE, 'results');

process.loadEnvFile(join(E2E, '.env.test'));
const E = process.env;
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const playwrightArgs = args.filter((a) => a !== '--skip-build');

const WEB = E.E2E_WEB_URL;
const GATEWAY = E.E2E_GATEWAY_URL;
const EDITOR = E.E2E_EDITOR_URL;
const SYNC_WS = `ws://localhost:${E.E2E_SYNC_PORT}`;
const SYNC_HTTP = `http://localhost:${E.E2E_SYNC_HTTP_PORT}`;
const MAIL = `http://127.0.0.1:${E.E2E_MAIL_PORT}`;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${E.E2E_PG_PORT}/canvasflow_e2e`;

// ── Guard rails ────────────────────────────────────────────────────────────
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);
for (const url of [WEB, GATEWAY, EDITOR, SYNC_WS, SYNC_HTTP, MAIL, DATABASE_URL]) {
  const host = new URL(url).hostname;
  if (!LOOPBACK.has(host)) {
    console.error(`REFUSING: ${url} is not on this machine`);
    process.exit(2);
  }
}
const ports = [WEB, GATEWAY, EDITOR, SYNC_WS, SYNC_HTTP, MAIL, DATABASE_URL].map(
  (u) => new URL(u).port,
);
const dev = ['3000', '3001', '3002', '4000', '4001'].filter((p) => ports.includes(p));
if (dev.length) {
  console.error(
    `REFUSING: ${dev.join(', ')} belong to the dev servers; pick other ports in .env.test`,
  );
  process.exit(2);
}
function portInUse(port) {
  return new Promise((done) => {
    const socket = createConnection({ port: Number(port), host: '127.0.0.1' });
    socket.once('connect', () => (socket.destroy(), done(true)));
    socket.once('error', () => done(false));
  });
}
for (const port of ports) {
  if (await portInUse(port)) {
    console.error(`REFUSING: port ${port} is already in use (a previous run still up?)`);
    process.exit(2);
  }
}

mkdirSync(LOGS, { recursive: true });
mkdirSync(RESULTS, { recursive: true });

/** Only what a process needs to run, never this shell's secrets. */
const base = { PATH: E.PATH, HOME: E.HOME, NEXT_TELEMETRY_DISABLED: '1', TZ: 'UTC' };

function run(cmd, cmdArgs, { cwd, env }) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, cmdArgs, { cwd, env, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} ${cmdArgs.join(' ')} exited ${code}`)),
    );
  });
}

const children = [];
function start(name, cmd, cmdArgs, { cwd, env }) {
  const log = openSync(join(LOGS, `${name}.log`), 'w');
  const child = spawn(cmd, cmdArgs, { cwd, env, stdio: ['ignore', log, log], detached: true });
  child.on('exit', (code, signal) => {
    if (!stopping)
      console.error(`✗ ${name} exited (${code ?? signal}); see local/logs/${name}.log`);
  });
  children.push({ name, child });
  return child;
}

async function waitForHttp(name, url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`${name} did not answer at ${url} within ${timeoutMs / 1000}s`);
}

let stopping = false;
let pg = null;
let mail = null;
let pgDir = null;
async function teardown() {
  stopping = true;
  for (const { child } of children.reverse()) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  await new Promise((r) => setTimeout(r, 1_500));
  for (const { child } of children) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  mail?.close();
  await pg?.stop().catch(() => {});
  if (pgDir) rmSync(pgDir, { recursive: true, force: true });
}
process.on('SIGINT', () => void teardown().then(() => process.exit(130)));

const appEnv = {
  web: {
    ...base,
    NODE_ENV: 'production',
    // Next reads apps/web/.env* unless told the environment is already loaded,
    // and that file points at Neon and holds a real Resend key.
    __NEXT_PROCESSED_ENV: 'true',
    NEXT_DIST_DIR: '.next-e2e',
    NEXT_PUBLIC_API_URL: GATEWAY,
    NEXT_PUBLIC_EDITOR_URL: EDITOR,
    AUTH_SECRET: E.E2E_AUTH_SECRET,
    AUTH_URL: WEB,
    DATABASE_URL,
    SYNC_INTERNAL_URL: SYNC_HTTP,
    RESEND_API_KEY: 're_local_e2e_fake',
    RESEND_BASE_URL: MAIL,
    EMAIL_FROM: 'onboarding@resend.dev',
  },
  editor: {
    ...base,
    VITE_API_URL: GATEWAY,
    VITE_WEB_URL: WEB,
    VITE_SYNC_URL: SYNC_WS,
    VITE_POSTHOG_KEY: '',
  },
};

/** Every project in playwright.config.ts, in the order it lists them; setup runs as chromium's dependency. */
async function listProjects() {
  const out = await new Promise((done, fail) => {
    let text = '';
    const child = spawn('pnpm', ['exec', 'playwright', 'test', '--list', '--reporter=json'], {
      cwd: E2E,
      env: { ...E, NODE_ENV: 'test' },
    });
    child.stdout.on('data', (d) => (text += d));
    child.on('exit', (code) =>
      code === 0 ? done(text) : fail(new Error('playwright --list failed')),
    );
  });
  const names = JSON.parse(out.slice(out.indexOf('{'))).config.projects.map((p) => p.name);
  return names.filter((name) => name !== 'setup');
}

/**
 * The last signup the gateway answered, read from its own log. Its rate limit
 * counts requests, so this is the clock that matters; the users table is not,
 * because every spec deletes the accounts it made.
 */
function lastSignupAt() {
  const log = readFileSync(join(LOGS, 'api-gateway.log'), 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  let last = 0;
  // Nest's console logger, with TZ=UTC: "11/09/2026, 7:13:50 AM … POST /auth/signup -> 201".
  const line =
    /(\d{2})\/(\d{2})\/(\d{4}), (\d{1,2}):(\d{2}):(\d{2}) (AM|PM).*POST \/auth\/signup ->/g;
  for (const m of log.matchAll(line)) {
    const hour = (Number(m[4]) % 12) + (m[7] === 'PM' ? 12 : 0);
    last = Math.max(last, Date.UTC(+m[3], +m[1] - 1, +m[2], hour, +m[5], +m[6]));
  }
  return last;
}

/** Wait until the gateway has seen no signup for a full minute, so the next project starts with the whole limit. */
async function quietSignupMinute() {
  const began = Date.now();
  for (;;) {
    // Whole seconds in the log, so one more on top of the minute.
    const since = Date.now() - lastSignupAt();
    if (since > 62_000) return Date.now() - began;
    await new Promise((r) => setTimeout(r, Math.min(62_000 - since + 250, 5_000)));
  }
}

const started = Date.now();
let exitCode = 1;
try {
  // ── Build ────────────────────────────────────────────────────────────────
  if (!skipBuild) {
    console.log('▶ building packages, sync-server and api-gateway');
    await run(
      'pnpm',
      [
        'exec',
        'turbo',
        'run',
        'build',
        '--filter=@canvasflow/sync-server...',
        '--filter=@canvasflow/api-gateway...',
        '--filter=@canvasflow/editor^...',
        '--filter=@canvasflow/web^...',
      ],
      { cwd: ROOT, env: { ...base } },
    );

    console.log('▶ building the editor into apps/editor/dist/e2e');
    await run('pnpm', ['exec', 'vite', 'build', '--outDir', 'dist/e2e', '--emptyOutDir'], {
      cwd: join(ROOT, 'apps/editor'),
      env: { ...appEnv.editor, NODE_ENV: 'production' },
    });

    // `next build` rewrites next-env.d.ts and tsconfig.json to point at its
    // output folder; both are put back exactly as they were.
    console.log('▶ building the web app into apps/web/.next-e2e');
    const kept = ['next-env.d.ts', 'tsconfig.json'].map((f) => {
      const path = join(ROOT, 'apps/web', f);
      return [path, readFileSync(path)];
    });
    try {
      await run('pnpm', ['exec', 'next', 'build'], {
        cwd: join(ROOT, 'apps/web'),
        env: appEnv.web,
      });
    } finally {
      for (const [path, content] of kept) writeFileSync(path, content);
    }
  }

  // ── Database ─────────────────────────────────────────────────────────────
  console.log('▶ starting Postgres');
  pgDir = mkdtempSync(join(tmpdir(), 'canvasflow-e2e-pg-'));
  pg = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: 'postgres',
    password: 'postgres',
    port: Number(E.E2E_PG_PORT),
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('canvasflow_e2e');
  const db = createClient(DATABASE_URL);
  await migrate(db, { migrationsFolder: join(ROOT, 'packages/db/migrations') });

  // ── Services ─────────────────────────────────────────────────────────────
  console.log('▶ starting fake mail, sync-server, api-gateway, web, editor');
  const mailLog = join(LOGS, 'mail.jsonl');
  writeFileSync(mailLog, '');
  mail = await startFakeResend({ port: Number(E.E2E_MAIL_PORT), logFile: mailLog });

  start('sync-server', 'node', ['dist/index.js'], {
    cwd: join(ROOT, 'services/sync-server'),
    env: {
      ...base,
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      PORT_WS: E.E2E_SYNC_PORT,
      PORT_HTTP: E.E2E_SYNC_HTTP_PORT,
      DATABASE_URL,
      AUTH_SECRET: E.E2E_AUTH_SECRET,
      WEB_URL: WEB,
      EDITOR_URL: EDITOR,
    },
  });
  start('api-gateway', 'node', ['dist/main.js'], {
    cwd: join(ROOT, 'services/api-gateway'),
    env: {
      ...base,
      NODE_ENV: 'development',
      PORT: new URL(GATEWAY).port,
      DATABASE_URL,
      AUTH_SECRET: E.E2E_AUTH_SECRET,
      WEB_URL: WEB,
      EDITOR_URL: EDITOR,
      API_PUBLIC_URL: GATEWAY,
      SYNC_INTERNAL_URL: SYNC_HTTP,
      RESEND_API_KEY: 're_local_e2e_fake',
      RESEND_BASE_URL: MAIL,
      DIGEST_TRIGGER_SECRET: E.E2E_DIGEST_TRIGGER_SECRET,
      // Fake OAuth apps, so the sign-in buttons build their redirect the way
      // they do when configured. Nothing follows it: the tests stop at the 302.
      GOOGLE_CLIENT_ID: 'local-e2e-fake.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'local-e2e-fake-google-secret',
      GITHUB_CLIENT_ID: 'local-e2e-fake-github-id',
      GITHUB_CLIENT_SECRET: 'local-e2e-fake-github-secret',
    },
  });
  start('web', 'pnpm', ['exec', 'next', 'start', '--port', new URL(WEB).port], {
    cwd: join(ROOT, 'apps/web'),
    env: appEnv.web,
  });
  start(
    'editor',
    'pnpm',
    [
      'exec',
      'vite',
      'preview',
      '--outDir',
      'dist/e2e',
      '--port',
      new URL(EDITOR).port,
      '--strictPort',
    ],
    { cwd: join(ROOT, 'apps/editor'), env: appEnv.editor },
  );

  await Promise.all([
    waitForHttp('sync-server', `${SYNC_HTTP}/health`),
    waitForHttp('api-gateway', `${GATEWAY}/`),
    waitForHttp('web', `${WEB}/login`),
    waitForHttp('editor', `${EDITOR}/`),
  ]);

  // ── The signed-in account auth.setup.ts uses ─────────────────────────────
  const signup = await fetch(`${GATEWAY}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB },
    body: JSON.stringify({
      email: E.E2E_EMAIL,
      password: E.E2E_PASSWORD,
      name: 'E2E Owner',
      termsVersion: TERMS_VERSION,
    }),
  });
  if (signup.status !== 201)
    throw new Error(`seeding the E2E account: ${signup.status} ${await signup.text()}`);
  await db.$client.query(`update users set email_verified_at = now() where email = $1`, [
    E.E2E_EMAIL,
  ]);
  console.log(`▶ stack up in ${Math.round((Date.now() - started) / 1000)} s; running Playwright`);

  // ── Playwright ───────────────────────────────────────────────────────────
  // The gateway allows ten signups a minute from one address, and most
  // projects sign up throwaway accounts of their own, so the suite cannot run
  // as one burst (the specs say to run each project on its own). By default
  // each project runs in turn, after the last minute has seen no signups.
  // Passing --project (or any test filter) runs exactly that, once.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const playwright = (extra, report) =>
    new Promise((done) => {
      const child = spawn(
        'pnpm',
        ['exec', 'playwright', 'test', '--reporter=list,json', ...extra, ...playwrightArgs],
        {
          cwd: E2E,
          stdio: 'inherit',
          env: {
            ...E,
            NODE_ENV: 'test',
            DATABASE_URL,
            E2E_GATEWAY_AUTH_SECRET: E.E2E_AUTH_SECRET,
            PLAYWRIGHT_JSON_OUTPUT_NAME: report,
          },
        },
      );
      child.on('exit', (code) => done(code ?? 1));
    });

  const filtered = playwrightArgs.some((a) => a.startsWith('--project') || !a.startsWith('-'));
  const projects = filtered ? [null] : await listProjects();
  const totals = { expected: 0, unexpected: 0, flaky: 0, skipped: 0, durationMs: 0, waitedMs: 0 };
  const testStarted = Date.now();
  exitCode = 0;
  for (const project of projects) {
    if (project) {
      const waited = await quietSignupMinute();
      totals.waitedMs += waited;
      console.log(
        `\n▶ project ${project}${waited ? ` (waited ${Math.round(waited / 1000)} s for the signup limit)` : ''}`,
      );
    }
    const report = join(RESULTS, `run-${stamp}-${project ?? 'filtered'}.json`);
    const code = await playwright(project ? [`--project=${project}`] : [], report);
    if (code !== 0) exitCode = code;
    try {
      const { stats } = JSON.parse(readFileSync(report, 'utf8'));
      for (const key of ['expected', 'unexpected', 'flaky', 'skipped']) totals[key] += stats[key];
      totals.durationMs += stats.duration;
    } catch {
      totals.unexpected += 1;
      console.error(`✗ no report from ${project ?? 'the run'}`);
    }
  }
  await db.$client.end();
  const summary = { ...totals, wallMs: Date.now() - testStarted, projects: projects.length };
  writeFileSync(join(RESULTS, `run-${stamp}-summary.json`), JSON.stringify(summary, null, 2));
  console.log(
    `\n▶ E2E: ${totals.expected} passed, ${totals.unexpected} failed, ${totals.flaky} flaky, ${totals.skipped} skipped ` +
      `· tests ${Math.round(totals.durationMs / 1000)} s, waiting ${Math.round(totals.waitedMs / 1000)} s, ` +
      `wall ${Math.round(summary.wallMs / 1000)} s · local/results/run-${stamp}-summary.json`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
} finally {
  await teardown();
}
process.exit(exitCode);
