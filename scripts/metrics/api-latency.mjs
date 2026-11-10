// Latency of every gateway route that can run offline, on this machine.
//
//   node scripts/metrics/local-db.mjs &          # throwaway Postgres on :54329
//   node scripts/metrics/api-latency.mjs [--samples=30] [--label=…] [--skip-build]
//
// Builds the gateway with tsc into services/api-gateway/dist-perf (never the
// dist/ a running `nest start --watch` uses), starts it in production mode on
// 127.0.0.1:4501 against the local Postgres, signs up its own accounts and
// times each route: a few warm-up calls, then `samples` sequential requests,
// each from request start to the last byte of the body. Only answers with the
// expected status count; any other status is reported, never timed.
//
// Conditions to keep in mind when reading the numbers: client, gateway and
// database are on one machine, so there is no network between them. In
// production the gateway (Fly, Singapore) reaches Neon over the network on
// every query, which this does not include. Email, storage, AI and payments
// are switched off, so routes that need them are listed as not measured.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { HERE, LOCAL_AUTH_SECRET, LOCAL_DB_URL, ROOT, assertLocal, pg } from './lib.mjs';

const argS = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const SAMPLES = Number(argS('samples', 30));
const LABEL = argS('label', 'now');
const PORT = 4501;
const BASE = `http://127.0.0.1:${PORT}`;
const WEB = 'https://web.metrics.test';
const EDITOR = 'https://editor.metrics.test';
const PASSWORD = 'Metrics password 1!';
assertLocal(LOCAL_DB_URL);
assertLocal(BASE);

const gatewayDir = resolve(ROOT, 'services/api-gateway');
const out = resolve(HERE, 'results');
mkdirSync(out, { recursive: true });

function run(cmd, args, cwd) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`))));
  });
}

if (!process.argv.includes('--skip-build')) {
  console.log('▶ building the gateway into services/api-gateway/dist-perf');
  await run(
    'pnpm',
    [
      'exec',
      'tsc',
      '-p',
      'tsconfig.build.json',
      '--outDir',
      'dist-perf',
      '--tsBuildInfoFile',
      'dist-perf/.tsbuildinfo',
    ],
    gatewayDir,
  );
}

// ── The gateway ────────────────────────────────────────────────────────
const log = openSync(resolve(out, `api-latency-${LABEL}.gateway.log`), 'w');
const gateway = spawn('node', ['dist-perf/main.js'], {
  cwd: gatewayDir,
  stdio: ['ignore', log, log],
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    PORT: String(PORT),
    DATABASE_URL: LOCAL_DB_URL,
    AUTH_SECRET: LOCAL_AUTH_SECRET,
    WEB_URL: WEB,
    EDITOR_URL: EDITOR,
    API_PUBLIC_URL: 'https://api.metrics.test',
    // One proxy hop believed, so each sample can name its own address and the
    // per-address limits do not stop the measurement.
    TRUST_PROXY_HOPS: '1',
    GOOGLE_CLIENT_ID: 'metrics-google-client',
    GOOGLE_CLIENT_SECRET: 'metrics-google-secret',
  },
});
const stop = () => gateway.kill('SIGTERM');
process.on('exit', stop);

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/healthz`)).ok) break;
  } catch {
    // not up yet
  }
  if (i > 100) throw new Error('gateway did not start; see the gateway log');
  await sleep(200);
}
console.log('▶ gateway up');

// ── A browser ──────────────────────────────────────────────────────────
let addressCount = 0;
const nextAddress = () => {
  addressCount += 1;
  return `198.18.${Math.floor(addressCount / 250)}.${(addressCount % 250) + 1}`;
};

class Browser {
  cookies = new Map();
  constructor(origin = WEB) {
    this.origin = origin;
    this.ip = nextAddress();
  }
  async send(method, path, body, { newAddress = false } = {}) {
    if (newAddress) this.ip = nextAddress();
    const headers = { Origin: this.origin, 'X-Forwarded-For': this.ip };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size)
      headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const started = performance.now();
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      redirect: 'manual',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const ms = performance.now() - started;
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';').map((s) => s.trim());
      const at = pair.indexOf('=');
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      const gone = attrs.some((a) => /^expires=/i.test(a) && new Date(a.slice(8)) <= new Date());
      if (gone || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // not JSON
    }
    return { status: response.status, ms, json };
  }
}

const db = new pg.Pool({ connectionString: LOCAL_DB_URL });
const q = (sql, params) => db.query(sql, params).then((r) => r.rows);

async function account(label) {
  const browser = new Browser();
  const email = `${label}-${randomUUID().slice(0, 8)}@metrics.test`;
  const up = await browser.send(
    'POST',
    '/auth/signup',
    { email, password: PASSWORD, name: label },
    { newAddress: true },
  );
  if (up.status !== 201) throw new Error(`signup ${up.status} ${JSON.stringify(up.json)}`);
  const inn = await browser.send(
    'POST',
    '/auth/signin',
    { email, password: PASSWORD },
    { newAddress: true },
  );
  if (inn.status !== 200) throw new Error(`signin ${inn.status}`);
  return { browser, email, id: inn.json.data.account.id };
}

async function signedIn(email) {
  const browser = new Browser();
  const inn = await browser.send(
    'POST',
    '/auth/signin',
    { email, password: PASSWORD },
    { newAddress: true },
  );
  if (inn.status !== 200) throw new Error(`signin ${inn.status}`);
  return browser;
}

// ── The people and things the routes need ─────────────────────────────
const owner = await account('owner');
const member = await account('member');
await q(`update users set email_verified_at = now() where id = $1`, [owner.id]);
const [team] = await q(
  `insert into workspace (name, slug, plan) values ('Metrics team', $1, 'team') returning id`,
  [`metrics-${randomUUID().slice(0, 8)}`],
);
await q(
  `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`,
  [team.id, owner.id, member.id],
);
const landing = (await owner.browser.send('GET', '/auth/landing-board')).json.boardId;
const teamBoard = (
  await owner.browser.send('POST', `/workspaces/${team.id}/boards`, { title: 'Team board' })
).json.data.id;

// ── Measuring ──────────────────────────────────────────────────────────
const results = [];

/**
 * Times one route. `request(i)` sends sample i and returns the reply;
 * `prepare(i)`, untimed, sets up whatever that sample consumes.
 */
async function measure(
  name,
  expected,
  request,
  { samples = SAMPLES, warmup = 3, prepare, note } = {},
) {
  const times = [];
  const unexpected = {};
  const total = warmup + samples;
  for (let i = 0; i < total; i++) {
    if (prepare) await prepare(i);
    const reply = await request(i);
    if (i < warmup) continue;
    if (expected.includes(reply.status)) times.push(reply.ms);
    else unexpected[reply.status] = (unexpected[reply.status] ?? 0) + 1;
  }
  times.sort((a, b) => a - b);
  const at = (p) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)];
  const floor1 = (v) => (v === undefined ? null : Math.floor(v * 10) / 10);
  const row = {
    route: name,
    samples: times.length,
    p50: floor1(at(50)),
    p95: floor1(at(95)),
    max: floor1(times.at(-1)),
    unexpected,
    note,
  };
  results.push(row);
  const bad = Object.keys(unexpected).length ? `  unexpected ${JSON.stringify(unexpected)}` : '';
  console.log(
    `${name.padEnd(52)} n=${String(row.samples).padStart(3)}  p50 ${row.p50}  p95 ${row.p95}  max ${row.max}${bad}`,
  );
}

const o = owner.browser;

// Health
await measure('GET /healthz', [200], () => o.send('GET', '/healthz'));
await measure('GET /health', [200], () => o.send('GET', '/health'));

// Accounts and sessions
await measure(
  'POST /auth/signup',
  [201],
  () =>
    new Browser().send('POST', '/auth/signup', {
      email: `s-${randomUUID()}@metrics.test`,
      password: PASSWORD,
      name: 'S',
    }),
  { warmup: 1, note: 'bcrypt cost 12' },
);
await measure(
  'POST /auth/signin',
  [200],
  () => new Browser().send('POST', '/auth/signin', { email: owner.email, password: PASSWORD }),
  { warmup: 1, note: 'bcrypt cost 12' },
);
{
  const refresher = await signedIn(member.email);
  await measure('POST /auth/refresh', [200], () => refresher.send('POST', '/auth/refresh'));
}
await measure('GET /auth/editor-token', [200], () =>
  o.send('GET', `/auth/editor-token?boardId=${landing}`, undefined, { newAddress: true }),
);
await measure('GET /auth/landing-board', [200], () =>
  o.send('GET', '/auth/landing-board', undefined, { newAddress: true }),
);
await measure('GET /auth/resume', [302], () =>
  o.send('GET', '/auth/resume?next=/open', undefined, { newAddress: true }),
);
await measure('GET /auth/oauth/google (hand-off)', [302], () =>
  new Browser().send('GET', '/auth/oauth/google'),
);
{
  let leaving;
  await measure('POST /auth/signout', [204], () => leaving.send('POST', '/auth/signout'), {
    warmup: 1,
    prepare: async () => {
      leaving = await signedIn(member.email);
    },
  });
  await measure('POST /auth/signout-all', [204], () => leaving.send('POST', '/auth/signout-all'), {
    warmup: 1,
    samples: 8,
    prepare: async () => {
      leaving = await signedIn(member.email);
    },
    note: '8 samples (limit 10/min)',
  });
}
await measure(
  'POST /auth/password/forgot',
  [200, 202],
  () =>
    new Browser().send('POST', '/auth/password/forgot', {
      email: `nobody-${randomUUID()}@metrics.test`,
    }),
  { samples: 20, note: 'no email sent (provider off)' },
);
await measure('POST /auth/password/reset/check', [200], () =>
  new Browser().send('POST', '/auth/password/reset/check', {
    token: randomUUID().replace(/-/g, '').padEnd(43, 'x'),
  }),
);
{
  let current = PASSWORD;
  const next = 'Metrics password 2!';
  await measure(
    'POST /auth/password/change',
    [200],
    (i) => {
      const body = {
        currentPassword: current,
        newPassword: current === PASSWORD ? next : PASSWORD,
        signOutOtherDevices: false,
      };
      return o.send('POST', '/auth/password/change', body, { newAddress: true }).then((r) => {
        if (r.status === 200) current = body.newPassword;
        return r;
      });
    },
    { warmup: 1, samples: 8, note: 'two bcrypt hashes; 8 samples (limit 10/min)' },
  );
  if (current !== PASSWORD) {
    await o.send(
      'POST',
      '/auth/password/change',
      { currentPassword: current, newPassword: PASSWORD, signOutOtherDevices: false },
      { newAddress: true },
    );
  }
}

// The account
for (const path of [
  '/users/me',
  '/users/me/storage',
  '/users/me/verification-status',
  '/users/me/security',
  '/users/me/deletion',
  '/users/me/notifications',
  '/users/me/shared-boards',
  '/users/me/username?name=metrics-free-name',
  `/ai/diagrams/usage?boardId=${landing}`,
]) {
  await measure(`GET ${path.split('?')[0].replace(landing, ':id')}`, [200], () =>
    o.send('GET', path),
  );
}
await measure(
  'GET /users/me/export/boards',
  [200],
  () => o.send('GET', '/users/me/export/boards'),
  {
    samples: 25,
    warmup: 2,
    note: '25 samples (limit 30/min)',
  },
);
// 204 is this route's answer for a board with no saved content yet.
await measure('GET /users/me/export/boards/:id', [200, 204], () =>
  o.send('GET', `/users/me/export/boards/${landing}`),
);
await measure(
  'PATCH /users/me/username',
  [200],
  (i) => o.send('PATCH', '/users/me/username', { username: `metrics${randomUUID().slice(0, 6)}` }),
  {
    warmup: 1,
    samples: 8,
    note: '8 samples (limit 10/min)',
  },
);
await measure(
  'PATCH /users/me/notifications',
  [200],
  (i) => o.send('PATCH', '/users/me/notifications', { commentMentions: i % 2 === 0 }),
  {
    samples: 25,
    warmup: 2,
  },
);

// Boards. The member signs in again: sign-out-everywhere above ended their sessions.
const m2 = await signedIn(member.email);
await measure('GET /boards', [200], () => o.send('GET', '/boards'));
await measure('POST /boards', [201], () => m2.send('POST', '/boards', { title: 'Timed' }), {
  samples: 25,
  warmup: 2,
  note: '25 samples (limit 30/min)',
});
await measure('GET /boards/:id', [200], () => o.send('GET', `/boards/${landing}`));
await measure('GET /boards/:id/overview', [200], () =>
  o.send('GET', `/boards/${landing}/overview`),
);
await measure(
  'PATCH /boards/:id',
  [200],
  (i) => o.send('PATCH', `/boards/${teamBoard}`, { title: `Renamed ${i}` }),
  { samples: 25, warmup: 2 },
);
await measure(
  'PUT /boards/:id/pin',
  [204],
  () => o.send('PUT', `/boards/${landing}/pin`, { position: 'a0' }),
  { samples: 25, warmup: 2 },
);
await measure('DELETE /boards/:id/pin', [204], () => o.send('DELETE', `/boards/${landing}/pin`), {
  samples: 25,
  warmup: 2,
});
{
  const archiver = await signedIn(owner.email);
  await measure(
    'PUT /boards/:id/archive',
    [200],
    () => archiver.send('PUT', `/boards/${teamBoard}/archive`, {}),
    {
      samples: 12,
      warmup: 1,
      prepare: () => archiver.send('DELETE', `/boards/${teamBoard}/archive`),
      note: '12 samples (limit 30/min, shared with unarchive)',
    },
  );
}
{
  const remover = await signedIn(owner.email);
  let doomed;
  await measure('DELETE /boards/:id', [200], () => remover.send('DELETE', `/boards/${doomed}`), {
    samples: 12,
    warmup: 1,
    prepare: async () => {
      [{ id: doomed }] = await q(
        `insert into boards (workspace_id, title, owner_id) values ($1, 'Doomed', $2) returning id`,
        [team.id, owner.id],
      );
    },
    note: '12 samples',
  });
}
await measure('GET /boards/:id/embed', [200, 404], () => o.send('GET', `/boards/${landing}/embed`));

// Workspaces
await measure('GET /workspaces/:id/boards', [200], () =>
  o.send('GET', `/workspaces/${team.id}/boards`),
);
await measure(
  'POST /workspaces/:id/boards',
  [201],
  () => m2.send('POST', `/workspaces/${team.id}/boards`, { title: 'Timed' }),
  {
    samples: 25,
    warmup: 2,
    note: '25 samples (limit 30/min)',
  },
);
await measure('GET /workspaces/:id/people', [200], () =>
  o.send('GET', `/workspaces/${team.id}/people`),
);
await measure(
  'PATCH /workspaces/:id/members/:userId',
  [204],
  (i) =>
    o.send('PATCH', `/workspaces/${team.id}/members/${member.id}`, {
      role: i % 2 ? 'member' : 'admin',
    }),
  { samples: 20, warmup: 2 },
);
{
  const invited = [];
  await measure(
    'POST /workspaces/:id/invites',
    [201],
    () =>
      o
        .send('POST', `/workspaces/${team.id}/invites`, {
          email: `invitee-${randomUUID().slice(0, 8)}@metrics.test`,
        })
        .then((r) => {
          if (r.status === 201) invited.push(r.json.data.invite.id);
          return r;
        }),
    { samples: 12, warmup: 1, note: 'no email sent (provider off); 12 samples (limit 30/h)' },
  );
  await measure(
    'DELETE /workspaces/:id/invites/:inviteId',
    [204],
    (i) => o.send('DELETE', `/workspaces/${team.id}/invites/${invited[i]}`),
    {
      samples: invited.length - 1,
      warmup: 1,
    },
  );
}
{
  const offer = `/workspaces/${team.id}/ownership-offer`;
  await measure(
    'POST /workspaces/:id/ownership-offer',
    [204],
    () => o.send('POST', offer, { userId: member.id }),
    {
      samples: 12,
      warmup: 1,
      prepare: () => o.send('DELETE', offer),
      note: 'no email sent (provider off)',
    },
  );
  await o.send('DELETE', offer);
}
{
  const leaver = await account('leaver');
  await measure(
    'POST /workspaces/:id/leave',
    [200],
    () => leaver.browser.send('POST', `/workspaces/${team.id}/leave`),
    {
      samples: 12,
      warmup: 1,
      prepare: () =>
        q(
          `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`,
          [team.id, leaver.id],
        ),
    },
  );
}

// Library
const shapes = [{ kind: 'rectangle', id: 'r1', x: 0, y: 0, width: 10, height: 10 }];
await measure('GET /library/items', [200], () => o.send('GET', '/library/items'));
{
  const made = [];
  await measure('POST /library/items', [201], () =>
    o.send('POST', '/library/items', { name: 'Timed', shapes }).then((r) => {
      if (r.status === 201) made.push(r.json.data.item?.id ?? r.json.data.id);
      return r;
    }),
  );
  await measure('PATCH /library/items/:id', [200], (i) =>
    o.send('PATCH', `/library/items/${made[i]}`, { name: `Renamed ${i}` }),
  );
  await measure(
    'DELETE /library/items/:id',
    [204],
    (i) => o.send('DELETE', `/library/items/${made[i]}`),
    { samples: made.length - 3 },
  );
}
await measure(
  'POST /library/items/import',
  [201],
  () => o.send('POST', '/library/items/import', { items: [{ name: 'Imported', shapes }] }),
  {
    warmup: 1,
    samples: 8,
    note: '8 samples (limit 10/min)',
  },
);
await measure('GET /library/added', [200], () => o.send('GET', '/library/added'));

// ── Results ────────────────────────────────────────────────────────────
const notMeasured = [
  ['POST /ai/diagrams', 'calls the AI provider'],
  [
    'POST /link-previews, GET /link-previews/images/:name/url',
    'fetches the linked site / object storage',
  ],
  [
    'POST /boards/:boardId/images/upload-url, GET /boards/:boardId/images/:fileId/url',
    'object storage',
  ],
  [
    'POST/DELETE /users/me/avatar, POST /users/me/avatar/upload-url, GET /boards/:boardId/avatars/:userId',
    'object storage',
  ],
  [
    'GET /embeds/:embedId (+ images, previews), PUT/DELETE /boards/:id/embed',
    'not set up in this run',
  ],
  ['/billing/* (7 routes)', 'payment provider'],
  ['GET /auth/oauth/*/callback', 'the provider’s token exchange'],
  [
    'POST /auth/email/verify, /auth/email/resend, /auth/password/reset, /auth/password/setup-link',
    'one-time emailed tokens',
  ],
  [
    'POST /users/me/deletion, POST /workspaces/:id/ownership-offer/accept, guests and member removal',
    'one-off changes not repeated for timing',
  ],
  [
    'POST /boards/:boardId/mentions, POST /notifications/unsubscribe',
    'need a comment thread / an emailed token',
  ],
  [
    'POST /internal/digest, /internal/notify, /billing/polar/webhook',
    'service-to-service, secret-gated',
  ],
  ['POST/DELETE /library/added', 'needs a published library'],
];

writeFileSync(
  resolve(out, `api-latency-${LABEL}.json`),
  JSON.stringify(
    {
      metric: 'api-latency',
      label: LABEL,
      date: new Date().toISOString(),
      samplesDefault: SAMPLES,
      conditions:
        'gateway built with tsc, NODE_ENV=production, on 127.0.0.1 with an embedded Postgres 17 on the same machine; sequential requests from one Node fetch client; time = request start to last body byte; no network between client, gateway and database',
      results,
      notMeasured,
    },
    null,
    2,
  ),
);
console.log(`▶ wrote results/api-latency-${LABEL}.json`);
await db.end();
stop();
process.exit(0);
