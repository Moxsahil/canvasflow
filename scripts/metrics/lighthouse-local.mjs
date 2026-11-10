// Lighthouse on local production builds of the web app and the editor.
//
//   node scripts/metrics/lighthouse-local.mjs --label=before [--runs=3] [--skip-build]
//     [--service-delay=0]
//
// What it does, all on this machine:
//   - builds the web app into apps/web/.next-perf and the editor into
//     apps/editor/dist/perf, so a running `next dev` / `vite` keeps its own
//     output (next-env.d.ts and tsconfig.json are put back as they were)
//   - starts a stand-in for the API gateway's and sync server's /health
//     routes, which the landing page's stats section reads while rendering.
//     --service-delay=<ms> makes each answer wait, the way a reply from
//     another region would
//   - serves both builds (`next start` on :3300, `vite preview` on :3302)
//   - runs Lighthouse 12 (default mobile emulation, headless Chromium) --runs
//     times per page and keeps the median of each figure
//
// Nothing reads the apps' own .env files, so nothing reaches Neon or the live
// services. Writes results/lighthouse/<label>/*.json and results/lighthouse-<label>.json.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { HERE, ROOT, LOCAL_DB_URL, env as machineEnv, sleep } from './lib.mjs';

const argS = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const LABEL = argS('label', 'run');
const RUNS = Number(argS('runs', 3));
const SERVICE_DELAY = Number(argS('service-delay', 0));
const SKIP_BUILD = process.argv.includes('--skip-build');

const WEB_PORT = 3300;
const EDITOR_PORT = 3302;
const SERVICES_PORT = 3399;
const SERVICES = `http://127.0.0.1:${SERVICES_PORT}`;
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const OUT = resolve(HERE, 'results/lighthouse', LABEL);
mkdirSync(OUT, { recursive: true });

const base = { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1' };
const webEnv = {
  ...base,
  NODE_ENV: 'production',
  // Next reads apps/web/.env* unless told the environment is already loaded.
  __NEXT_PROCESSED_ENV: 'true',
  NEXT_DIST_DIR: '.next-perf',
  NEXT_PUBLIC_API_URL: SERVICES,
  NEXT_PUBLIC_EDITOR_URL: `http://localhost:${EDITOR_PORT}`,
  SYNC_INTERNAL_URL: SERVICES,
  AUTH_SECRET: 'local-metrics-secret-not-used-anywhere-else-000000',
  AUTH_URL: `http://localhost:${WEB_PORT}`,
  DATABASE_URL: LOCAL_DB_URL,
  RESEND_API_KEY: 're_local_metrics_fake',
  EMAIL_FROM: 'onboarding@resend.dev',
};
const editorEnv = {
  ...base,
  VITE_API_URL: SERVICES,
  VITE_WEB_URL: `http://localhost:${WEB_PORT}`,
  VITE_SYNC_URL: 'ws://127.0.0.1:3398',
  VITE_POSTHOG_KEY: '',
};

function run(cmd, args, { cwd, env, log }) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (d) => (text += d));
    child.stderr.on('data', (d) => (text += d));
    child.on('exit', (code) => {
      if (log) writeFileSync(log, text);
      code === 0
        ? ok(text)
        : fail(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${text.slice(-3000)}`));
    });
  });
}

const children = [];
function start(cmd, args, { cwd, env }) {
  const child = spawn(cmd, args, { cwd, env, stdio: 'ignore', detached: true });
  children.push(child);
}
function stopAll() {
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGTERM');
    } catch {}
  }
}
process.on('exit', stopAll);
process.on('SIGINT', () => process.exit(130));

async function waitForHttp(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (r.status < 500) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`${url} did not answer`);
}

// ── Stand-in services ───────────────────────────────────────────────────
const services = createServer((req, res) => {
  setTimeout(() => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') res.end(JSON.stringify({ ok: true, connections: 12, documents: 4 }));
    else if (req.url === '/healthz') res.end(JSON.stringify({ ok: true, uptime: 86_400 }));
    else ((res.statusCode = 404), res.end('{}'));
  }, SERVICE_DELAY);
});
await new Promise((ok) => services.listen(SERVICES_PORT, '127.0.0.1', ok));

// ── Build ──────────────────────────────────────────────────────────────
const webDir = join(ROOT, 'apps/web');
const editorDir = join(ROOT, 'apps/editor');
if (!SKIP_BUILD) {
  console.log('▶ building the editor into apps/editor/dist/perf');
  await run('pnpm', ['exec', 'vite', 'build', '--outDir', 'dist/perf', '--emptyOutDir'], {
    cwd: editorDir,
    env: { ...editorEnv, NODE_ENV: 'production' },
    log: join(OUT, 'build-editor.log'),
  });
  console.log('▶ building the web app into apps/web/.next-perf');
  const kept = ['next-env.d.ts', 'tsconfig.json'].map((f) => [
    join(webDir, f),
    readFileSync(join(webDir, f)),
  ]);
  try {
    await run('pnpm', ['exec', 'next', 'build'], {
      cwd: webDir,
      env: webEnv,
      log: join(OUT, 'build-web.log'),
    });
  } finally {
    for (const [path, content] of kept) writeFileSync(path, content);
  }
}

// ── Bundle sizes ───────────────────────────────────────────────────────
/** Raw and gzip bytes of every .js file under a folder. */
function jsSizes(dir) {
  let raw = 0;
  let gz = 0;
  let files = 0;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) {
        const buf = readFileSync(p);
        raw += buf.length;
        gz += gzipSync(buf).length;
        files++;
      }
    }
  };
  walk(dir);
  return { files, rawBytes: raw, gzipBytes: gz };
}
/** The scripts the editor's index.html loads up front (entry + modulepreload). */
function editorInitial() {
  const html = readFileSync(join(editorDir, 'dist/perf/index.html'), 'utf8');
  const srcs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  let raw = 0;
  let gz = 0;
  for (const s of new Set(srcs)) {
    const buf = readFileSync(join(editorDir, 'dist/perf', s));
    raw += buf.length;
    gz += gzipSync(buf).length;
  }
  return { files: new Set(srcs).size, rawBytes: raw, gzipBytes: gz };
}
const bundles = {
  editorAllJs: jsSizes(join(editorDir, 'dist/perf/assets')),
  editorInitialJs: editorInitial(),
  webAllClientJs: jsSizes(join(webDir, '.next-perf/static/chunks')),
};
try {
  const log = readFileSync(join(OUT, 'build-web.log'), 'utf8');
  bundles.webRouteTable = log.slice(log.indexOf('Route (app)'), log.indexOf('○  (Static)') + 400);
} catch {}

// ── Serve and audit ─────────────────────────────────────────────────────
console.log('▶ serving the web app on :3300 and the editor on :3302');
start('pnpm', ['exec', 'next', 'start', '--port', String(WEB_PORT)], { cwd: webDir, env: webEnv });
start(
  'pnpm',
  [
    'exec',
    'vite',
    'preview',
    '--outDir',
    'dist/perf',
    '--port',
    String(EDITOR_PORT),
    '--strictPort',
  ],
  { cwd: editorDir, env: editorEnv },
);
await waitForHttp(`http://localhost:${WEB_PORT}/`);
await waitForHttp(`http://localhost:${EDITOR_PORT}/`);
// One unmeasured request each, so the first audit is not also the server's first render.
await fetch(`http://localhost:${WEB_PORT}/`).catch(() => {});
await fetch(`http://localhost:${EDITOR_PORT}/`).catch(() => {});

const AUDITS = {
  lcpMs: 'largest-contentful-paint',
  tbtMs: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  fcpMs: 'first-contentful-paint',
  speedIndexMs: 'speed-index',
  ttfbMs: 'server-response-time',
  totalBytes: 'total-byte-weight',
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Lighthouse's Chrome launcher, under WSL, makes its temporary profile in a
 * folder named after the Windows temp path, inside the working directory.
 * Removed after every run so none are left behind.
 */
function removeWindowsTempProfiles() {
  for (const name of readdirSync(HERE)) {
    if (name.startsWith('C:\\')) rmSync(join(HERE, name), { recursive: true, force: true });
  }
}

const pages = {};
for (const [name, url] of [
  ['web', `http://localhost:${WEB_PORT}/`],
  ['editor', `http://localhost:${EDITOR_PORT}/`],
]) {
  const runs = [];
  for (let r = 1; r <= RUNS; r++) {
    const path = join(OUT, `${name}-${r}.json`);
    await run(
      'pnpm',
      [
        'dlx',
        'lighthouse@12.8.2',
        url,
        '--quiet',
        '--only-categories=performance,accessibility,best-practices',
        '--output=json',
        `--output-path=${path}`,
        '--chrome-flags=--headless=new --no-sandbox',
      ],
      { cwd: HERE, env: { ...process.env, CHROME_PATH: CHROME } },
    );
    removeWindowsTempProfiles();
    const lhr = JSON.parse(readFileSync(path, 'utf8'));
    const row = {
      performance: Math.round(lhr.categories.performance.score * 100),
      accessibility: Math.round(lhr.categories.accessibility.score * 100),
      bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
    };
    for (const [k, id] of Object.entries(AUDITS)) row[k] = lhr.audits[id]?.numericValue ?? null;
    const scripts = lhr.audits['resource-summary']?.details?.items?.find(
      (i) => i.resourceType === 'script',
    );
    row.scriptTransferBytes = scripts?.transferSize ?? null;
    row.scriptRequests = scripts?.requestCount ?? null;
    row.lighthouseVersion = lhr.lighthouseVersion;
    runs.push(row);
    console.log(`  ${name} run ${r}: ${JSON.stringify(row)}`);
  }
  const med = {};
  for (const k of Object.keys(runs[0])) {
    if (typeof runs[0][k] === 'number') med[k] = median(runs.map((x) => x[k]));
  }
  pages[name] = { url, runs, median: med };
}

const result = {
  metric: 'lighthouse-local',
  label: LABEL,
  date: new Date().toISOString(),
  runsPerPage: RUNS,
  serviceDelayMs: SERVICE_DELAY,
  conditions:
    'Lighthouse 12.8.2 default mobile emulation (simulated throttling), Playwright Chromium 1234 headless; ' +
    'next start (web) and vite preview (editor) on loopback; health routes answered by a local stand-in',
  bundles,
  pages,
  machine: machineEnv(),
};
writeFileSync(resolve(HERE, `results/lighthouse-${LABEL}.json`), JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      bundles: { ...bundles, webRouteTable: undefined },
      medians: Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, v.median])),
    },
    null,
    2,
  ),
);
services.close();
stopAll();
process.exit(0);
