// Metric 5: compaction savings on generated long-lived boards.
// Pure ESM so canvas-engine, yjs and the provider share one Yjs instance.
// Usage: node compaction.mjs --ops=5000
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  HERE,
  ROOT,
  LOCAL_DB_URL,
  LOCAL_AUTH_SECRET,
  pg,
  WS,
  ORIGIN,
  SYNC_URL,
  mintToken,
  env,
  sleep,
  assertLocal,
} from './lib.mjs';

assertLocal(LOCAL_DB_URL);
const OPS = Number(process.argv.find((a) => a.startsWith('--ops='))?.split('=')[1] ?? 5000);
const PNPM = resolve(ROOT, 'node_modules/.pnpm');
const imp = (p) => import(pathToFileURL(p).href);
const Y = await imp(`${PNPM}/yjs@13.6.31/node_modules/yjs/dist/yjs.mjs`);
const CE = await imp(resolve(ROOT, 'packages/canvas-engine/dist/index.js'));
const { HocuspocusProvider, HocuspocusProviderWebsocket } = await imp(
  `${PNPM}/@hocuspocus+provider@2.15.3_y-protocols@1.0.7_yjs@13.6.31__yjs@13.6.31/node_modules/@hocuspocus/provider/dist/hocuspocus-provider.esm.js`,
);
const { saveSnapshot } = await imp(
  resolve(ROOT, 'services/sync-server/dist/persistence/board-updates-store.js'),
);
const { createClient } = await imp(resolve(ROOT, 'packages/db/dist/index.js'));

const seed = JSON.parse(readFileSync(resolve(HERE, 'results/seed.json'), 'utf8'));
const pool = new pg.Pool({ connectionString: LOCAL_DB_URL });

async function newBoard(title) {
  const { rows } = await pool.query(
    `insert into boards (workspace_id, title, owner_id) values ($1, $2, $3) returning id`,
    [seed.workspaceId, title, seed.userId],
  );
  return rows[0].id;
}
async function measure(boardId) {
  const { rows } = await pool.query(
    `select count(*)::int as rows, coalesce(sum(octet_length("update")),0)::bigint as bytes from board_updates where board_id = $1`,
    [boardId],
  );
  return { rows: rows[0].rows, bytes: Number(rows[0].bytes) };
}
async function latestDoc(boardId) {
  const { rows } = await pool.query(`select "update" from board_updates where board_id = $1`, [
    boardId,
  ]);
  const doc = new Y.Doc();
  if (rows.length) Y.applyUpdate(doc, Y.mergeUpdates(rows.map((r) => new Uint8Array(r.update))));
  return new CE.BoardDocument(doc).getShapes().length;
}

// Deterministic PRNG so both boards get the same op sequence.
function rng(seedN) {
  let s = seedN >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
async function generate(board, ops, onOp) {
  const rand = rng(42);
  const ids = [];
  let n = 0;
  for (let i = 0; i < ops; i++) {
    const r = rand();
    if (r < 0.4 || ids.length < 5) {
      const id = `s${n++}`;
      board.addShape(
        CE.createRectangle({
          id,
          x: rand() * 4000,
          y: rand() * 4000,
          width: 40 + rand() * 200,
          height: 40 + rand() * 200,
        }),
      );
      ids.push(id);
    } else if (r < 0.8) {
      const id = ids[Math.floor(rand() * ids.length)];
      board.updateShape(id, { x: rand() * 4000, y: rand() * 4000 });
    } else {
      const k = Math.floor(rand() * ids.length);
      board.deleteShapes([ids[k]]);
      ids.splice(k, 1);
    }
    if (onOp) await onOp(i);
  }
  return ids.length;
}

const syncEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  DATABASE_URL: LOCAL_DB_URL,
};
function runRepoScript(script, args = '') {
  return execSync(
    `env -i PATH="$PATH" HOME="$HOME" DATABASE_URL="${LOCAL_DB_URL}" npx tsx scripts/${script} ${args}`,
    {
      cwd: resolve(ROOT, 'services/sync-server'),
      encoding: 'utf8',
      env: syncEnv,
    },
  );
}
async function healthy() {
  try {
    return (await fetch('http://127.0.0.1:4001/health')).ok;
  } catch {
    return false;
  }
}

const out = { metric: 'compaction', ops: OPS, env: env() };

// ---------- Board A: through the real sync-server ----------
if (!(await healthy())) {
  spawn(resolve(HERE, 'start-sync.sh'), [], { stdio: 'ignore', detached: true }).unref();
  while (!(await healthy())) await sleep(50);
}
const boardA = await newBoard('Compaction A (server path)');
{
  class OriginWS extends WS {
    constructor(a) {
      super(a, [], { headers: { origin: ORIGIN } });
    }
  }
  const token = await mintToken({ ...seed, boardId: boardA });
  const doc = new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({ url: SYNC_URL, WebSocketPolyfill: OriginWS });
  let synced;
  const ready = new Promise((r) => (synced = r));
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: boardA,
    document: doc,
    token,
    onSynced: () => synced(),
  });
  await ready;
  const board = new CE.BoardDocument(doc, seed.userId);
  const t0 = Date.now();
  const live = await generate(board, OPS, async (i) => {
    if (i % 50 === 49) await sleep(5);
  });
  while (provider.unsyncedChanges > 0) await sleep(20);
  out.boardA = { boardId: boardA, liveShapes: live, generateMs: Date.now() - t0 };
  provider.destroy();
  socket.destroy();
  // Graceful stop: Hocuspocus stores every open document on destroy.
  execSync(`pkill -TERM -f '^node dist/index.js' || true`);
  while (await healthy()) await sleep(50);
  await sleep(1000);
  out.boardA.beforeCompaction = await measure(boardA);
}

// ---------- Board B: legacy log, one FULL snapshot appended per save ----------
// What onStoreDocument wrote before saveSnapshot() started pruning: a complete
// Y.encodeStateAsUpdate on every debounced save. Simulated as one save per
// SAVE_EVERY edits, then the real saveSnapshot() prune is applied.
const SAVE_EVERY = 50;
const boardB = await newBoard('Compaction B (legacy snapshot log)');
{
  const board = new CE.BoardDocument(new Y.Doc(), seed.userId);
  // Server-side mirror: a plain Y.Doc fed the same updates, like the one
  // Hocuspocus holds. The client doc's undo manager keeps deleted items
  // alive, so its own encoding is larger than anything the server stores.
  const mirror = new Y.Doc();
  board.yDoc.on('update', (u) => Y.applyUpdate(mirror, u));
  const snaps = [];
  const live = await generate(board, OPS, async (i) => {
    if ((i + 1) % SAVE_EVERY === 0) snaps.push(Y.encodeStateAsUpdate(mirror));
  });
  for (let i = 0; i < snaps.length; i++) {
    await pool.query(
      `insert into board_updates (board_id, author_id, "update", size_bytes, created_at) values ($1,$2,$3,$4, now() - interval '1 hour' + interval '${i} seconds')`,
      [boardB, seed.userId, Buffer.from(snaps[i]), snaps[i].length],
    );
  }
  out.boardB = {
    boardId: boardB,
    liveShapes: live,
    saves: snaps.length,
    saveEvery: SAVE_EVERY,
    beforeCompaction: await measure(boardB),
  };
  const db = createClient(LOCAL_DB_URL);
  await saveSnapshot(db, boardB, seed.userId, Y.encodeStateAsUpdate(mirror));
  out.boardB.afterSaveSnapshotPrune = await measure(boardB);
}

// ---------- Board C: erase-heavy board (constructed) ----------
const boardC = await newBoard('Compaction C (erase-heavy)');
{
  const board = new CE.BoardDocument(new Y.Doc(), seed.userId);
  const mirror = new Y.Doc();
  board.yDoc.on('update', (u) => Y.applyUpdate(mirror, u));
  const ids = [];
  for (let i = 0; i < 3000; i++) {
    const id = `c${i}`;
    board.addShape(
      CE.createRectangle({
        id,
        x: (i % 60) * 60,
        y: Math.floor(i / 60) * 60,
        width: 50,
        height: 50,
      }),
    );
    ids.push(id);
  }
  for (let i = 0; i < 2900; i++) board.deleteShapes([ids[i]]);
  const db = createClient(LOCAL_DB_URL);
  await saveSnapshot(db, boardC, seed.userId, Y.encodeStateAsUpdate(mirror));
  await pool.query(
    `update board_updates set created_at = now() - interval '1 hour' where board_id = $1`,
    [boardC],
  );
  out.boardC = {
    boardId: boardC,
    added: 3000,
    erased: 2900,
    liveShapes: board.getShapes().length,
    beforeCompaction: await measure(boardC),
  };
}

// ---------- History-free rebuild for both ----------
out.compactDocumentsOutput = runRepoScript('compact-documents.ts', '--apply --idle-minutes=0')
  .trim()
  .split('\n');
out.boardA.afterCompactDocuments = await measure(boardA);
out.boardB.afterCompactDocuments = await measure(boardB);
out.boardC.afterCompactDocuments = await measure(boardC);
out.boardC.shapesAfter = await latestDoc(boardC);
out.boardA.shapesAfter = await latestDoc(boardA);
out.boardB.shapesAfter = await latestDoc(boardB);

const pct = (a, b) => (100 * (a - b)) / a;
out.summary = {
  A_bytes_reduction_pct: pct(
    out.boardA.beforeCompaction.bytes,
    out.boardA.afterCompactDocuments.bytes,
  ),
  B_rows: `${out.boardB.beforeCompaction.rows} -> ${out.boardB.afterSaveSnapshotPrune.rows} -> ${out.boardB.afterCompactDocuments.rows}`,
  B_rows_reduction_pct: pct(
    out.boardB.beforeCompaction.rows,
    out.boardB.afterSaveSnapshotPrune.rows,
  ),
  B_bytes_reduction_after_prune_pct: pct(
    out.boardB.beforeCompaction.bytes,
    out.boardB.afterSaveSnapshotPrune.bytes,
  ),
  B_bytes_reduction_total_pct: pct(
    out.boardB.beforeCompaction.bytes,
    out.boardB.afterCompactDocuments.bytes,
  ),
  C_bytes_reduction_pct: pct(
    out.boardC.beforeCompaction.bytes,
    out.boardC.afterCompactDocuments.bytes,
  ),
};
console.log(JSON.stringify(out, null, 2));
writeFileSync(resolve(HERE, 'results/compaction.json'), JSON.stringify(out, null, 2));
await pool.end();
process.exit(0);
