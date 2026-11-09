// Metric 2: one-hop sync latency A -> sync-server -> B on the same board.
// Usage: node sync-latency.mjs --samples=200 --runs=3 [--gap=20]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { HERE, mintToken, connectClient, destroyClient, stats, env, sleep } from './lib.mjs';

const arg = (k, d) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const SAMPLES = arg('samples', 200);
const RUNS = arg('runs', 3);
const GAP = arg('gap', 20);
const seed = JSON.parse(readFileSync(resolve(HERE, 'results/seed.json'), 'utf8'));

const runs = [];
for (let r = 0; r < RUNS; r++) {
  const a = connectClient(await mintToken(seed, 'A'), seed.boardId);
  const b = connectClient(await mintToken(seed, 'B'), seed.boardId);
  await Promise.all([a.ready, b.ready]);
  await sleep(500);

  const runId = `${Date.now()}-${r}`;
  const pending = new Map();
  const samples = [];
  const probesB = b.doc.getMap('__metrics_probes__');
  probesB.observe((ev) => {
    const now = performance.now();
    for (const [key, ch] of ev.changes.keys) {
      if (ch.action !== 'add') continue;
      const res = pending.get(key);
      if (res) res(now);
    }
  });
  const probesA = a.doc.getMap('__metrics_probes__');
  let timeouts = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const key = `${runId}-${i}`;
    const got = new Promise((res) => pending.set(key, res));
    const t0 = performance.now();
    probesA.set(key, { t: Date.now() });
    const t1 = await Promise.race([got, sleep(5000).then(() => null)]);
    pending.delete(key);
    if (t1 === null) timeouts++;
    else samples.push(t1 - t0);
    await sleep(GAP);
  }
  destroyClient(a);
  destroyClient(b);
  const s = stats(samples);
  console.log(`run ${r + 1}:`, JSON.stringify({ ...s, timeouts }));
  runs.push({ ...s, timeouts, samples });
  await sleep(500);
}
const all = stats(runs.flatMap((r) => r.samples));
const out = {
  metric: 'sync-latency',
  samplesPerRun: SAMPLES,
  runs: RUNS,
  gapMs: GAP,
  perRun: runs.map(({ samples, ...s }) => s),
  pooled: all,
  env: env(),
};
console.log('pooled:', JSON.stringify(all));
writeFileSync(resolve(HERE, 'results/sync-latency.json'), JSON.stringify(out, null, 2));
process.exit(0);
