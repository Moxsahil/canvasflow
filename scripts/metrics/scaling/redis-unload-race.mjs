// Reproduces a split room with the Redis fan-out on: someone edits a board,
// leaves, and the board is reopened on the same instance before the edit's
// debounced save has run.
//
// What happens, in @hocuspocus/server 2.15 with @hocuspocus/extension-redis:
//   - The Redis extension unloads the room 1 s after its last connection
//     closes, even with unloadImmediately: false, while the server's 10 s
//     store debounce for the last edit is still pending.
//   - The board is reopened, so a new document object is loaded under the
//     same name.
//   - The old debounced save then runs and, finding no connections on the
//     *old* object, calls unloadDocument(old). That looks the room up by name
//     and removes the *new* document from the server's map.
//   - The people now on the board are attached to a document the server no
//     longer lists, so Redis messages for the board never reach them, and
//     their edits never reach anyone on another instance.
//
// Each trial uses a board nobody has opened (seed.mjs --spare-boards):
//   1. X joins on sync-2, alone on the board, edits ("edit") or not
//      ("no-edit", the control), and leaves.
//   2. After --gaps ms, B joins on sync-2 and A on sync-1.
//   3. Everyone waits until 12 s after X's edit, past the 10 s debounce.
//   4. A writes; B must see it. B writes; A must see it. 3 s each.
// A trial "split" when either direction never arrives.
//
//   docker compose -f infra/scaling/docker-compose.yml --profile load run --rm \
//     loadgen redis-unload-race.mjs --tries=5
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ORIGIN, RESULTS, args, load, machine, mintToken, sleep } from './lib.mjs';

const Y = load('yjs');
const WS = load('ws');
const { HocuspocusProvider, HocuspocusProviderWebsocket } = load('@hocuspocus/provider');

class OriginWebSocket extends WS {
  constructor(address) {
    super(address, [], { headers: { origin: ORIGIN } });
  }
}

const a = args();
const TRIES = Number(a.tries ?? 5);
const GAPS = String(a.gaps ?? '500,1500,3000,6000')
  .split(',')
  .map(Number);
const VARIANTS = String(a.variants ?? 'no-edit,edit').split(',');
const HOLD_MS = 12_000;
const seed = JSON.parse(readFileSync(resolve(RESULTS, 'seed.json'), 'utf8'));
const boards = [...seed.spareBoards];

async function join(url, boardId, name) {
  const doc = new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: OriginWebSocket });
  const token = await mintToken({ ...seed, boardId }, name);
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`${name}: timeout`)), 20_000);
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: boardId,
      document: doc,
      token,
      onSynced: () => {
        clearTimeout(timer);
        ok({ doc, socket, provider });
      },
    });
  });
}
const leave = (c) => {
  c.provider.destroy();
  c.socket.destroy();
};

function arrives(client, key, ms = 3000) {
  const map = client.doc.getMap('race');
  if (map.has(key)) return Promise.resolve(true);
  return new Promise((res) => {
    const handler = () => {
      if (!map.has(key)) return;
      map.unobserve(handler);
      clearTimeout(t);
      res(true);
    };
    const t = setTimeout(() => {
      map.unobserve(handler);
      res(false);
    }, ms);
    map.observe(handler);
  });
}

async function trial(variant, gap, boardId) {
  const X = await join('ws://sync-2:4000', boardId, 'X');
  const editedAt = Date.now();
  if (variant === 'edit') {
    X.doc.getMap('race').set('x', 1);
    await sleep(200);
  }
  leave(X);
  await sleep(gap);
  const [B, A] = await Promise.all([
    join('ws://sync-2:4000', boardId, 'B'),
    join('ws://sync-1:4000', boardId, 'A'),
  ]);
  await sleep(Math.max(300, editedAt + HOLD_MS - Date.now()));
  A.doc.getMap('race').set('fromA', 1);
  const aToB = await arrives(B, 'fromA');
  B.doc.getMap('race').set('fromB', 1);
  const bToA = await arrives(A, 'fromB');
  leave(A);
  leave(B);
  return { aToB, bToA, split: !aToB || !bToA };
}

// Trials run a few at a time, each on its own board, so the 12 s hold does
// not make the whole run take minutes per gap.
const plan = [];
for (const variant of VARIANTS)
  for (const gap of GAPS) for (let t = 1; t <= TRIES; t++) plan.push({ variant, gap, try: t });
if (plan.length > boards.length)
  throw new Error('not enough spare boards: seed.mjs --spare-boards=<more>');
const trials = [];
const PARALLEL = 5;
for (let i = 0; i < plan.length; i += PARALLEL) {
  const batch = plan.slice(i, i + PARALLEL).map((p) => ({ ...p, boardId: boards.shift() }));
  const out = await Promise.all(batch.map((p) => trial(p.variant, p.gap, p.boardId)));
  batch.forEach((p, k) => {
    trials.push({ ...p, ...out[k] });
    console.error(
      `${p.variant} gap=${p.gap} try=${p.try}: A→B ${out[k].aToB ? 'ok' : 'LOST'}, B→A ${out[k].bToA ? 'ok' : 'LOST'}`,
    );
  });
}

const summary = {};
for (const tr of trials) {
  const k = `${tr.variant}@${tr.gap}`;
  summary[k] ??= { trials: 0, split: 0 };
  summary[k].trials++;
  if (tr.split) summary[k].split++;
}
for (const [k, v] of Object.entries(summary)) console.error(`${k}: split ${v.split}/${v.trials}`);
writeFileSync(
  resolve(RESULTS, a.out ?? 'redis-unload-race.json'),
  JSON.stringify(
    {
      metric: 'redis-unload-race',
      tries: TRIES,
      gaps: GAPS,
      holdMs: HOLD_MS,
      summary,
      trials,
      machine: machine(),
    },
    null,
    2,
  ),
);
process.exit(0);
