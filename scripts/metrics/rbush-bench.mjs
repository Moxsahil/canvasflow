// Metric 4b: SpatialIndex (rbush) marquee-selection query time, in Node,
// using the canvas engine's own SpatialIndex + createRectangle.
// Usage: node rbush-bench.mjs --sizes=100,500,1000 --queries=10000 --runs=5
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { HERE, ROOT, stats, env } from './lib.mjs';

const argS = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const SIZES = argS('sizes', '100,500,1000').split(',').map(Number);
const QUERIES = Number(argS('queries', 10000));
const RUNS = Number(argS('runs', 5));
const CE = await import(pathToFileURL(resolve(ROOT, 'packages/canvas-engine/dist/index.js')).href);

let s = 7;
const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const out = {
  metric: 'rbush-selection-query',
  queries: QUERIES,
  runs: RUNS,
  marquee: '400x300 world units, random position in 4000x4000',
  results: {},
  env: env(),
};

for (const N of SIZES) {
  const shapes = Array.from({ length: N }, (_, i) =>
    CE.createRectangle({
      id: `s${i}`,
      x: rand() * 4000,
      y: rand() * 4000,
      width: 20 + rand() * 120,
      height: 20 + rand() * 120,
    }),
  );
  const idx = new CE.SpatialIndex();
  const rebuilds = [];
  const queryUs = [];
  let hits = 0;
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now();
    idx.rebuild(shapes);
    rebuilds.push((performance.now() - t0) * 1000);
    for (let w = 0; w < 1000; w++)
      idx.searchRect({ x: rand() * 4000, y: rand() * 4000, width: 400, height: 300 });
    for (let q = 0; q < QUERIES; q++) {
      const rect = { x: rand() * 3600, y: rand() * 3700, width: 400, height: 300 };
      const t = performance.now();
      hits += idx.searchRect(rect).length;
      queryUs.push((performance.now() - t) * 1000);
    }
  }
  out.results[N] = {
    queryMicroseconds: stats(queryUs),
    rebuildMicroseconds: stats(rebuilds),
    avgHitsPerQuery: hits / (QUERIES * RUNS),
  };
  console.log(N, JSON.stringify(out.results[N]));
}
writeFileSync(resolve(HERE, 'results/rbush-bench.json'), JSON.stringify(out, null, 2));
