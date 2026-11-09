// Do two clients on different sync-server instances see each other's edits?
//
// Client A connects straight to sync-1 and client B straight to sync-2 (no
// load balancer, so which instance each one is on is never in doubt). A
// writes, and the time until B's observer fires is one cross-instance
// delivery: A → sync-1 → Redis → sync-2 → B. The same measurement with both
// clients on sync-1 is the baseline, so the cost of the Redis hop is the
// difference between the two.
//
//   docker compose -f infra/scaling/docker-compose.yml --profile load run --rm \
//     loadgen cross-instance.mjs --samples=200 --runs=3
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  ORIGIN,
  RESULTS,
  args,
  assertLocal,
  load,
  machine,
  mintToken,
  sleep,
  stats,
} from './lib.mjs';

const Y = load('yjs');
const WS = load('ws');
const { HocuspocusProvider, HocuspocusProviderWebsocket } = load('@hocuspocus/provider');

class OriginWebSocket extends WS {
  constructor(address) {
    super(address, [], { headers: { origin: ORIGIN } });
  }
}

const a = args();
const SAMPLES = Number(a.samples ?? 200);
const RUNS = Number(a.runs ?? 3);
const GAP = Number(a.gap ?? 20);
const seed = JSON.parse(readFileSync(resolve(RESULTS, 'seed.json'), 'utf8'));

function connect(url, name) {
  assertLocal(url);
  const doc = new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: OriginWebSocket });
  return mintToken(seed, name).then(
    (token) =>
      new Promise((ok, fail) => {
        const timer = setTimeout(() => fail(new Error(`${name}: timeout`)), 20_000);
        const provider = new HocuspocusProvider({
          websocketProvider: socket,
          name: seed.boardId,
          document: doc,
          token,
          onSynced: () => {
            clearTimeout(timer);
            ok({ doc, socket, provider });
          },
          onAuthenticationFailed: ({ reason }) => fail(new Error(`${name}: ${reason}`)),
        });
      }),
  );
}

/** Time from a write on `from` until `to` observes it, SAMPLES times. */
async function measure(from, to, tag) {
  const pending = new Map();
  const samples = [];
  let timeouts = 0;
  const target = to.doc.getMap('__scaling_cross__');
  const handler = (ev) => {
    const now = performance.now();
    for (const [key, ch] of ev.changes.keys) {
      if (ch.action === 'add') pending.get(key)?.(now);
    }
  };
  target.observe(handler);
  for (let i = 0; i < SAMPLES; i++) {
    const key = `${tag}-${i}`;
    const got = new Promise((res) => pending.set(key, res));
    const t0 = performance.now();
    from.doc.getMap('__scaling_cross__').set(key, i);
    const t1 = await Promise.race([got, sleep(5000).then(() => null)]);
    pending.delete(key);
    if (t1 === null) timeouts++;
    else samples.push(t1 - t0);
    await sleep(GAP);
  }
  target.unobserve(handler);
  return { samples, timeouts };
}

function close(...clients) {
  for (const c of clients) {
    c.provider.destroy();
    c.socket.destroy();
  }
}

const result = { metric: 'cross-instance', samplesPerRun: SAMPLES, runs: RUNS, gapMs: GAP };
for (const [label, urlA, urlB] of [
  ['crossInstance', 'ws://sync-1:4000', 'ws://sync-2:4000'],
  ['sameInstance', 'ws://sync-1:4000', 'ws://sync-1:4000'],
]) {
  const perRun = [];
  const all = [];
  let timeouts = 0;
  let reverseOk = true;
  for (let r = 0; r < RUNS; r++) {
    const A = await connect(urlA, 'A');
    const B = await connect(urlB, 'B');
    await sleep(500);
    const tag = `${label}-${Date.now()}-${r}`;
    const m = await measure(A, B, tag);
    // The other direction too, so "they sync" is shown both ways.
    const back = await measure(B, A, `${tag}-back`);
    if (back.timeouts > 0) reverseOk = false;
    const converged =
      JSON.stringify(A.doc.getMap('__scaling_cross__').toJSON()) ===
      JSON.stringify(B.doc.getMap('__scaling_cross__').toJSON());
    perRun.push({
      ...stats(m.samples),
      timeouts: m.timeouts,
      reverseTimeouts: back.timeouts,
      converged,
    });
    all.push(...m.samples);
    timeouts += m.timeouts;
    close(A, B);
    await sleep(500);
  }
  result[label] = { urlA, urlB, perRun, pooled: stats(all), timeouts, reverseOk };
  const p = result[label].pooled;
  console.error(
    `${label}: n=${p.n} median=${p.median?.toFixed(2)} p95=${p.p95?.toFixed(2)} ms timeouts=${timeouts} ` +
      `reverse ${reverseOk ? 'ok' : 'FAILED'} converged=${perRun.every((x) => x.converged)}`,
  );
}
result.machine = machine();
writeFileSync(resolve(RESULTS, 'cross-instance.json'), JSON.stringify(result, null, 2));
process.exit(0);
