// Metric 3: N simultaneous provider connections to one board.
// Usage: node concurrency.mjs --levels=10,50,100,250,500 --runs=3
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { HERE, mintToken, connectClient, destroyClient, stats, env, sleep } from './lib.mjs';

const argS = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const LEVELS = argS('levels', '10,50,100,250,500').split(',').map(Number);
const RUNS = Number(argS('runs', 3));
const WRITERS = 5;
const EDITS_PER_WRITER = 20;
const EDIT_GAP_MS = 100;
const seed = JSON.parse(readFileSync(resolve(HERE, 'results/seed.json'), 'utf8'));

async function level(N, run) {
  const tokens = await Promise.all(Array.from({ length: N }, (_, i) => mintToken(seed, `c${i}`)));
  const t0 = performance.now();
  const clients = tokens.map((t) => {
    const c = connectClient(t, seed.boardId, { timeoutMs: 30000 });
    c.readyAt = c.ready.then(() => performance.now() - t0);
    return c;
  });
  const settled = await Promise.allSettled(clients.map((c) => c.readyAt));
  const live = clients.filter((_, i) => settled[i].status === 'fulfilled');
  const connectMs = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const errors = settled
    .filter((s) => s.status === 'rejected')
    .map((s) => String(s.reason?.message));

  const tag = `${Date.now()}-${N}-${run}`;
  const sent = new Map(); // key -> t
  const latencies = [];
  let received = 0;
  for (const c of live) {
    c.doc.getMap('__metrics_probes__').observe((ev) => {
      const now = performance.now();
      for (const [key, ch] of ev.changes.keys) {
        if (ch.action !== 'add' || !key.startsWith(tag)) continue;
        const t = sent.get(key);
        if (t === undefined) continue; // own local write arrives before sent.set? no: set first
        received++;
        latencies.push(now - t);
      }
    });
  }
  await sleep(1000);
  const writers = live.slice(0, Math.min(WRITERS, live.length));
  for (let e = 0; e < EDITS_PER_WRITER; e++) {
    for (const [w, c] of writers.entries()) {
      const key = `${tag}-${w}-${e}`;
      sent.set(key, performance.now());
      c.doc.getMap('__metrics_probes__').set(key, { w, e });
    }
    await sleep(EDIT_GAP_MS);
  }
  await sleep(5000); // settle
  // Each writer's own local write fires its own observer synchronously (latency ~0);
  // exclude those: expected remote deliveries = updates * (live - 1).
  const updates = writers.length * EDITS_PER_WRITER;
  const expected = updates * live.length; // includes writers' self-observation
  const dropped = expected - received;
  // remote-only latency: drop the `updates` smallest samples (writers' own synchronous observations)
  const remote = [...latencies].sort((a, b) => a - b).slice(updates);
  for (const c of clients) destroyClient(c);
  const res = {
    N,
    run,
    connected: live.length,
    successRate: live.length / N,
    connectErrors: [...new Set(errors)],
    connectMs: stats(connectMs),
    updates,
    expectedDeliveries: expected,
    received,
    dropped,
    remoteLatencyMs: stats(remote),
  };
  const { min, max, ...cm } = res.connectMs;
  console.log(
    `N=${N} run=${run} connected=${live.length}/${N} dropped=${dropped}/${expected} ` +
      `lat median=${res.remoteLatencyMs.median?.toFixed(2)} p95=${res.remoteLatencyMs.p95?.toFixed(2)} ` +
      `connect median=${cm.median?.toFixed(0)} p95=${cm.p95?.toFixed(0)}` +
      (errors.length ? ` errors=${JSON.stringify(res.connectErrors)}` : ''),
  );
  await sleep(3000);
  return res;
}

const results = [];
let highestStable = null;
outer: for (const N of LEVELS) {
  for (let r = 1; r <= RUNS; r++) {
    const res = await level(N, r);
    results.push(res);
    if (res.successRate < 1 || res.dropped !== 0) {
      console.log(`errors began at N=${N}`);
      break outer;
    }
  }
  highestStable = N;
}
writeFileSync(
  resolve(HERE, 'results/concurrency.json'),
  JSON.stringify(
    {
      metric: 'concurrency',
      writers: WRITERS,
      editsPerWriter: EDITS_PER_WRITER,
      editGapMs: EDIT_GAP_MS,
      highestStable,
      results,
      env: env(),
    },
    null,
    2,
  ),
);
console.log('highest stable N tested:', highestStable);
process.exit(0);
