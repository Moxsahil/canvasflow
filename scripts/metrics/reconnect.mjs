// Metric 6: sync-server outage of D seconds (SIGKILL), offline edits, reconnect.
// Owns the sync-server process (scripts/metrics/start-sync.sh).
// Usage: node reconnect.mjs --outages=5,30,120 --runs=3
import { readFileSync, writeFileSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  HERE,
  Y,
  pg,
  LOCAL_DB_URL,
  mintToken,
  connectClient,
  destroyClient,
  stats,
  env,
  sleep,
} from './lib.mjs';

const argS = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const OUTAGES = argS('outages', '5,30,120').split(',').map(Number);
const RUNS = Number(argS('runs', 3));
const EDITS = 10;
const seed = JSON.parse(readFileSync(resolve(HERE, 'results/seed.json'), 'utf8'));
const pool = new pg.Pool({ connectionString: LOCAL_DB_URL });

let server = null;
async function healthy() {
  try {
    const r = await fetch('http://127.0.0.1:4001/health');
    return r.ok;
  } catch {
    return false;
  }
}
async function startServer() {
  const log = openSync(resolve(HERE, 'results/sync.log'), 'a');
  server = spawn(resolve(HERE, 'start-sync.sh'), [], {
    stdio: ['ignore', log, log],
    detached: false,
  });
  const t0 = performance.now();
  while (!(await healthy())) await sleep(25);
  return performance.now() - t0;
}
function killServer() {
  server?.kill('SIGKILL');
  // start-sync.sh execs node, so the pid is node's own.
}

// Stop any sync-server started outside this script.
try {
  execSync(`pkill -f '^node dist/index.js'`);
} catch {}
await sleep(1000);
await startServer();

const countTag = (doc, tag) =>
  [...doc.getMap('__metrics_probes__').keys()].filter((k) => k.startsWith(tag)).length;

async function waitFor(fn, timeoutMs) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (fn()) return performance.now() - t0;
    await sleep(10);
  }
  return null;
}

async function dbCount(tag) {
  const { rows } = await pool.query(
    `select "update" from board_updates where board_id = $1 order by created_at desc limit 3`,
    [seed.boardId],
  );
  if (!rows.length) return 0;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.mergeUpdates(rows.map((r) => new Uint8Array(r.update))));
  return countTag(doc, tag);
}

const results = [];
for (const D of OUTAGES) {
  for (let run = 1; run <= RUNS; run++) {
    const tag = `rc-${Date.now()}-${D}-${run}-`;
    const a = connectClient(await mintToken(seed, 'A'), seed.boardId);
    const b = connectClient(await mintToken(seed, 'B'), seed.boardId);
    await Promise.all([a.ready, b.ready]);
    await sleep(500);

    const resynced = { a: null, b: null };
    let restartedAt = Infinity;
    for (const [name, c] of [
      ['a', a],
      ['b', b],
    ]) {
      c.provider.on('synced', ({ state }) => {
        if (state && resynced[name] === null && performance.now() > restartedAt)
          resynced[name] = performance.now();
      });
    }

    const downAt = performance.now();
    killServer();
    await sleep(200);
    for (let i = 0; i < EDITS; i++) {
      a.doc.getMap('__metrics_probes__').set(`${tag}a-${i}`, { offline: true });
      b.doc.getMap('__metrics_probes__').set(`${tag}b-${i}`, { offline: true });
    }
    await sleep(D * 1000 - 200);
    const bootMs = await startServer();
    restartedAt = performance.now() - bootMs; // spawn time
    const healthyAt = performance.now();

    const both = await waitFor(
      () => countTag(a.doc, tag) === 2 * EDITS && countTag(b.doc, tag) === 2 * EDITS,
      120000,
    );
    await waitFor(() => resynced.a !== null && resynced.b !== null, 120000);

    const c = connectClient(await mintToken(seed, 'C'), seed.boardId);
    let freshCount = null;
    try {
      await c.ready;
      freshCount = countTag(c.doc, tag);
    } catch {}
    destroyClient(c);

    await sleep(35000); // > maxDebounce (30s) so the server has stored the doc
    const persisted = await dbCount(tag);

    destroyClient(a);
    destroyClient(b);
    const res = {
      outageS: D,
      run,
      serverBootMs: bootMs,
      reconnectAfterServerUpMs: {
        a: resynced.a === null ? null : resynced.a - healthyAt,
        b: resynced.b === null ? null : resynced.b - healthyAt,
      },
      reconnectAfterOutageStartMs: {
        a: resynced.a === null ? null : resynced.a - downAt,
        b: resynced.b === null ? null : resynced.b - downAt,
      },
      offlineEditsMade: 2 * EDITS,
      bothClientsHaveAllAfterMs: both,
      freshClientSees: freshCount,
      persistedInPostgres: persisted,
    };
    console.log(JSON.stringify(res));
    results.push(res);
    await sleep(2000);
  }
}

const summary = {};
for (const D of OUTAGES) {
  const rs = results.filter((r) => r.outageS === D);
  const after = rs
    .flatMap((r) => [r.reconnectAfterServerUpMs.a, r.reconnectAfterServerUpMs.b])
    .filter((x) => x !== null);
  summary[D] = {
    clientReconnects: after.length,
    reconnectAfterServerUpMs: stats(after),
    editsPreserved: rs.map((r) => `${r.persistedInPostgres}/${r.offlineEditsMade}`),
    freshClient: rs.map((r) => `${r.freshClientSees}/${r.offlineEditsMade}`),
  };
}
console.log(JSON.stringify(summary, null, 2));
writeFileSync(
  resolve(HERE, 'results/reconnect.json'),
  JSON.stringify({ metric: 'reconnect', kill: 'SIGKILL', results, summary, env: env() }, null, 2),
);
await pool.end();
// leave a server running for later scripts
server.unref();
process.exit(0);
