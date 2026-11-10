// One load level: N clients on one board, spread over several processes.
//
// Runs inside the compose network (the `loadgen` service), started by
// sweep.mjs. Usage, for a single level by hand:
//
//   docker compose -f infra/scaling/docker-compose.yml --profile load run --rm \
//     loadgen coordinator.mjs --n=500 --url=ws://lb:4000
//
// Phases: connect (ramped), hold while 5 writers edit for --edit-seconds,
// then wait for every delivery to land. Every connected client must receive
// every edit it did not write; anything missing after the settle window is a
// dropped update.
import { fork } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HERE, RESULTS, args, assertLocal, machine, sleep, stats } from './lib.mjs';

const a = args();
const N = Number(a.n ?? 500);
const URL = a.url ?? 'ws://lb:4000';
// Each client decodes every peer's presence, so client work grows with N²;
// spreading clients thin keeps the generator from being the bottleneck.
const PROCS = Number(a.procs ?? Math.min(12, Math.max(2, Math.ceil(N / 40))));
const RAMP = Number(a.ramp ?? 500); // new connections per second, all processes together
const WRITERS = Number(a.writers ?? 5);
const EDIT_SECONDS = Number(a['edit-seconds'] ?? 30);
const EDIT_GAP_MS = Number(a['edit-gap'] ?? 200);
const PRESENCE = a.presence !== '0';
const CONNECT_TIMEOUT_MS = Number(a['connect-timeout'] ?? 60_000);
const SETTLE_IDLE_MS = 10_000;
const SETTLE_MAX_MS = 60_000;
const OUT = a.out ? resolve(HERE, a.out) : null;
assertLocal(URL);

const seed = JSON.parse(readFileSync(resolve(RESULTS, 'seed.json'), 'utf8'));
const runTag = `run-${Date.now()}`;
const writers = Array.from({ length: Math.min(WRITERS, N) }, (_, i) => i);

const workers = [];
const per = Math.floor(N / PROCS);
let first = 0;
for (let p = 0; p < PROCS; p++) {
  const count = p === PROCS - 1 ? N - first : per;
  const child = fork(resolve(HERE, 'worker.mjs'), [], {
    execArgv: ['--max-old-space-size=4096'],
  });
  const w = { child, count, inbox: [] };
  child.on('message', (m) => {
    if (m.type === 'error') {
      console.error(`worker ${p}:`, m.error);
      process.exit(1);
    }
    const waiter = w.waiters?.[m.type];
    if (waiter) {
      delete w.waiters[m.type];
      waiter(m);
    }
  });
  workers.push(w);
  child.send({
    type: 'config',
    config: {
      url: URL,
      count,
      firstIndex: first,
      rampPerSec: RAMP / PROCS,
      seed,
      writers,
      runTag,
      editGapMs: EDIT_GAP_MS,
      editSeconds: EDIT_SECONDS,
      presence: PRESENCE,
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
    },
  });
  first += count;
}

function ask(w, type, reply = type) {
  return new Promise((res) => {
    w.waiters ??= {};
    w.waiters[reply] = res;
    if (type) w.child.send({ type });
  });
}

const t0 = Date.now();
const conn = await Promise.all(workers.map((w) => ask(w, null, 'connected')));
const connected = conn.reduce((s, c) => s + c.connected, 0);
const connectErrors = {};
for (const c of conn)
  for (const [k, v] of Object.entries(c.errors)) connectErrors[k] = (connectErrors[k] ?? 0) + v;
const connectMs = stats(conn.flatMap((c) => c.connectMs));
const connectPhaseMs = Date.now() - t0;
console.error(`connected ${connected}/${N} in ${connectPhaseMs} ms`);

await sleep(3000);
const tw = Date.now();
const written = await Promise.all(workers.map((w) => ask(w, 'write', 'written')));
const sent = written.reduce((s, x) => s + x.sent, 0);
const expected = sent * Math.max(0, connected - 1);

// Settle: wait until every delivery has landed, or nothing has moved for a while.
let last = -1;
let lastMove = Date.now();
const settleStart = Date.now();
let total = 0;
while (Date.now() - settleStart < SETTLE_MAX_MS) {
  const p = await Promise.all(workers.map((w) => ask(w, 'progress')));
  total = p.reduce((s, x) => s + x.received, 0);
  if (total >= expected) break;
  if (total !== last) {
    last = total;
    lastMove = Date.now();
  } else if (Date.now() - lastMove > SETTLE_IDLE_MS) break;
  await sleep(500);
}
const settleMs = Date.now() - settleStart;

const reports = await Promise.all(workers.map((w) => ask(w, 'report')));
const received = reports.reduce((s, r) => s + r.received, 0);
// Which (receiver, writer) pairs came up short, grouped by writer.
const perWriterSent = Object.fromEntries(written.flatMap((x) => Object.entries(x.perWriter ?? {})));
const shortPairs = {};
for (const r of reports) {
  for (const c of r.perClient) {
    for (const [w, n] of Object.entries(perWriterSent)) {
      if (Number(w) === c.index) continue;
      const got = c.fromWriter[w] ?? 0;
      if (got < n) {
        shortPairs[w] ??= { receiversShort: 0, receiversWithNone: 0 };
        shortPairs[w].receiversShort++;
        if (got === 0) shortPairs[w].receiversWithNone++;
      }
    }
  }
}
const latency = stats(reports.flatMap((r) => r.latencies));
const result = {
  metric: 'scaling-level',
  url: URL,
  N,
  procs: PROCS,
  rampPerSec: RAMP,
  presence: PRESENCE,
  writers: writers.length,
  editSeconds: EDIT_SECONDS,
  editGapMs: EDIT_GAP_MS,
  connected,
  connectErrors,
  connectMs,
  connectPhaseMs,
  sent,
  expected,
  received,
  dropped: expected - received,
  latencyMs: latency,
  writePhaseMs: Date.now() - tw - settleMs,
  settleMs,
  shortPairsByWriter: shortPairs,
  clientDisconnects: reports.reduce((s, r) => s + r.disconnects, 0),
  generator: {
    loopLagP99MaxMs: Math.max(...reports.map((r) => r.loopLagMs.p99)),
    loopLagMaxMs: Math.max(...reports.map((r) => r.loopLagMs.max)),
    rssMBTotal: reports.reduce((s, r) => s + r.rssMB, 0),
  },
  machine: machine(),
};
const f = (x) => (x === undefined ? 'n/a' : x.toFixed(1));
console.error(
  `N=${N} connected=${connected}/${N} dropped=${result.dropped}/${expected} ` +
    `latency median=${f(latency.median)} p95=${f(latency.p95)} max=${f(latency.max)} ms ` +
    `disconnects=${result.clientDisconnects} genLagP99=${result.generator.loopLagP99MaxMs.toFixed(0)}ms`,
);
if (OUT) {
  mkdirSync(resolve(OUT, '..'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
}
for (const w of workers) w.child.send({ type: 'close' });
await sleep(1000);
process.exit(0);
