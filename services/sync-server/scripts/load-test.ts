import { createClient, boards } from '@canvasflow/db';
import { and, eq, isNull } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import WS from 'ws';

/**
 * Real clients, real sockets, against a real running sync-server — the thing
 * the sprint plan's exit criteria actually ask for:
 *
 *   - cursor sync p95 <= 80ms, edits p95 <= 100ms
 *   - 50 concurrent users, no dropped messages, no document divergence
 *   - a client that drops for a while reconnects and merges cleanly
 *
 * k6 cannot generate this traffic without hand-encoding the Yjs binary sync
 * protocol, which is a lot of work to test a protocol this repo did not
 * write. Driving real @hocuspocus/provider instances is both less work and
 * more honest: it exercises the exact client the editor ships.
 *
 * Deliberately does not touch the board's `shapes` array — that is real
 * content a person is looking at. Every probe this script writes lives in
 * its own top-level Y.Map instead, which the editor never reads and the
 * compaction job (scripts/compact-documents.ts) never carries into a
 * rebuilt document. Run this against a throwaway board; nothing it writes
 * needs cleaning up, and nothing it writes is even visible in the editor.
 *
 * Usage:
 *   pnpm --filter @canvasflow/sync-server load-test -- --board=<uuid>
 *   ... --users=50 --writers=5 --duration=30
 *   ... --disconnect-test               # also exercises the reconnect path
 */

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function arg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const BOARD_ID = arg('board');
const USERS = Number(arg('users', '50'));
const WRITERS = Math.min(Number(arg('writers', '5')), USERS);
const DURATION_MS = Number(arg('duration', '30')) * 1000;
const SYNC_URL = arg('url', 'ws://localhost:4000')!;
const ORIGIN = arg('origin', 'http://localhost:3002')!;
const CONNECT_TIMEOUT_MS = Number(arg('connect-timeout', '15')) * 1000;
const SETTLE_MS = 3_000;
const DISCONNECT_TEST = flag('disconnect-test');
const DISCONNECT_SECONDS = Number(arg('disconnect-seconds', '15'));

if (!BOARD_ID) {
  console.error('usage: load-test.ts --board=<uuid> [--users=50] [--writers=5] [--duration=30]');
  process.exit(1);
}

const AWARENESS_INTERVAL_MS = 200; // roughly the editor's own cursor cadence
const EDIT_INTERVAL_MS = 1_000;
const PROBE_MAP_KEY = '__load_test_probes__';

/**
 * Tags every probe this run writes, so a re-run against the same board can
 * never mistake a previous run's leftovers for its own traffic.
 *
 * The probe map is deliberately durable — it lives in the real Y.Doc, so it
 * survives exactly like any other edit would — which means a second run
 * against the same board downloads the first run's entries on connect, as
 * fresh-looking inserts. Without this tag that reads as real messages
 * carrying real (very old) timestamps: an earlier version of this script
 * reported a multi-minute "edit latency" that was actually the age of a
 * probe from the previous run, not anything this run measured.
 */
const RUN_ID = randomUUID();

interface ProbeValue {
  ts: number;
  from: number;
  runId: string;
  offline?: boolean;
}

// ---------------------------------------------------------------------------
// Auth — minted directly, matching apps/web/src/lib/auth/editor-token.ts
// ---------------------------------------------------------------------------

async function mintToken(
  secret: Uint8Array,
  identity: { boardId: string; workspaceId: string; ownerId: string },
  index: number,
): Promise<string> {
  return new SignJWT({
    // Every simulated connection authenticates AS the board's real owner —
    // the same UUID, every time. resolveBoardAccess's first check is
    // `board.ownerId === userId`, so this is genuine access, not a bypass,
    // and it needs no throwaway `users` rows: the thing under test is the
    // transport and the CRDT, not identity lookup. It also has to be a real
    // UUID — `board_members.user_id` is a uuid column, and a string like
    // "load-test-0" fails there with a Postgres syntax error before the
    // owner check even gets a chance to short-circuit it.
    id: identity.ownerId,
    email: null,
    name: `Load Test ${index}`,
    isGuest: false,
    boardId: identity.boardId,
    workspaceId: identity.workspaceId,
    role: 'owner',
    accessSource: 'owner',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor((Date.now() + Math.max(600_000, DURATION_MS + 120_000)) / 1000))
    .setIssuedAt()
    .sign(secret);
}

/**
 * Forces the Origin header on the handshake, matching a browser.
 *
 * The provider constructs its transport with `new WebSocketPolyfill(url)` —
 * one argument, no room for options — so the only way to set a header is a
 * subclass that supplies it itself. Without this every connection is
 * refused before authentication is even attempted: sync-server's origin
 * allowlist runs first.
 */
class OriginWebSocket extends WS {
  constructor(address: string) {
    super(address, [], { headers: { origin: ORIGIN } });
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}
function summarize(label: string, samples: number[]): void {
  if (samples.length === 0) {
    console.log(`  ${label}: no samples`);
    return;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  console.log(
    `  ${label}: n=${sorted.length}  p50=${percentile(sorted, 50).toFixed(0)}ms  ` +
      `p95=${percentile(sorted, 95).toFixed(0)}ms  max=${sorted[sorted.length - 1]!.toFixed(0)}ms`,
  );
}

const cursorLatencies: number[] = [];
const editLatencies: number[] = [];
// Kept apart from editLatencies on purpose: this number is *supposed* to be
// large — it is the time an edit spent queued while its author was offline,
// which is what the disconnect exit criterion checks, not steady-state sync
// speed. Pooling it into the p95 above would make a single deliberately
// delayed message look like the transport got slow.
const offlineEditLatencies: number[] = [];
let editsWritten = 0;
const offlineUpload: { wrote: boolean; seenByControl: boolean } = {
  wrote: false,
  seenByControl: false,
};

// ---------------------------------------------------------------------------
// One simulated client
// ---------------------------------------------------------------------------

interface Client {
  index: number;
  doc: Y.Doc;
  socket: HocuspocusProviderWebsocket;
  provider: HocuspocusProvider;
  connected: Promise<void>;
  /**
   * Set while this client is deliberately offline (plus a short buffer for
   * the reconnect to actually flush). While it holds, this client's own
   * observations do not count toward the general latency pools.
   *
   * Its own tagged offline probe is already routed to offlineEditLatencies
   * separately — this is the *other* half of the same problem: on
   * reconnect it also receives every regular message the still-connected
   * writers sent during the gap, each arriving several seconds late for a
   * reason that has nothing to do with transport speed. Without this guard
   * those land in the same pool as genuine live-connected latency and the
   * p95 becomes "how long was the outage," not "how fast is the sync."
   */
  offlineUntil: number;
}

function spawnClient(token: string, boardId: string, index: number): Client {
  const doc = new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({
    url: SYNC_URL,
    WebSocketPolyfill: OriginWebSocket,
    // The test supplies its own retry loop around disconnect(); the built-in
    // backoff would otherwise fight the deliberate offline window below.
    maxAttempts: 0,
  });

  let resolveConnected: () => void;
  let rejectConnected: (err: Error) => void;
  const connected = new Promise<void>((res, rej) => {
    resolveConnected = res;
    rejectConnected = rej;
  });

  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: boardId,
    document: doc,
    token,
    onAuthenticated: () => resolveConnected(),
    onAuthenticationFailed: ({ reason }) => rejectConnected(new Error(`auth failed: ${reason}`)),
  });

  // Built before the observer below so the closure can read its mutable
  // offlineUntil field by reference — set later, once main() decides which
  // client the disconnect test picks.
  const client: Client = { index, doc, socket, provider, connected, offlineUntil: 0 };

  // Every client watches every probe, itself included — a self-observation
  // is the round trip through the server's own encode/relay/decode, which is
  // exactly the number the plan's latency criteria are about.
  const probes = doc.getMap<ProbeValue>(PROBE_MAP_KEY);
  probes.observe((event) => {
    for (const [key, change] of event.changes.keys) {
      if (change.action !== 'add') continue;
      const value = probes.get(key);
      if (!value || value.runId !== RUN_ID) continue;
      if (value.offline) {
        offlineEditLatencies.push(Date.now() - value.ts);
        continue;
      }
      if (Date.now() < client.offlineUntil) continue; // catch-up backlog, not live latency
      editLatencies.push(Date.now() - value.ts);
    }
  });

  return client;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const secretString = process.env.AUTH_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (!secretString || !databaseUrl) {
    console.error('AUTH_SECRET and DATABASE_URL are required (run with --env-file=.env)');
    process.exit(1);
  }
  const secret = new TextEncoder().encode(secretString);

  const db = createClient(databaseUrl);
  const rows = await db
    .select({
      id: boards.id,
      title: boards.title,
      workspaceId: boards.workspaceId,
      ownerId: boards.ownerId,
    })
    .from(boards)
    .where(and(eq(boards.id, BOARD_ID!), isNull(boards.deletedAt)))
    .limit(1);
  const board = rows[0];
  if (!board) {
    console.error(`Board ${BOARD_ID} not found (or soft-deleted).`);
    process.exit(1);
  }

  console.log(
    `Load test — board "${board.title}" (${board.id})\n` +
      `  ${USERS} users, ${WRITERS} writers, ${DURATION_MS / 1000}s` +
      (DISCONNECT_TEST ? `, +${DISCONNECT_SECONDS}s disconnect window` : '') +
      `\n`,
  );

  console.log('Connecting...');
  const clients: Client[] = [];
  for (let i = 0; i < USERS; i++) {
    const token = await mintToken(
      secret,
      { boardId: board.id, workspaceId: board.workspaceId, ownerId: board.ownerId },
      i,
    );
    clients.push(spawnClient(token, board.id, i));
  }

  const results = await Promise.allSettled(
    clients.map((c) =>
      Promise.race([
        c.connected,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('connect timeout')), CONNECT_TIMEOUT_MS),
        ),
      ]),
    ),
  );
  const connectedCount = results.filter((r) => r.status === 'fulfilled').length;
  console.log(`Connected: ${connectedCount}/${USERS}\n`);

  const live = clients.filter((_, i) => results[i]!.status === 'fulfilled');
  if (live.length === 0) {
    console.error('Nobody connected — nothing left to measure.');
    process.exit(1);
  }

  // --- awareness (cursor) traffic, from everyone --------------------------
  //
  // Latency is recorded event-driven, not by polling. y-protocols' Awareness
  // fires 'update' the instant it processes an incoming remote message — that
  // moment IS the delivery, so timestamping there measures real propagation.
  // Polling on an interval instead would read whatever value happened to be
  // cached at that tick, which is bounded below by the poll period itself
  // rather than by anything the network actually did — a first version of
  // this harness did exactly that and reported ~200ms flat against a
  // 200ms poll, which was the poll period, not the network.
  for (const c of live) {
    const awareness = c.provider.awareness;
    if (!awareness) continue;
    awareness.on('update', (changes: { added: number[]; updated: number[] }) => {
      const now = Date.now();
      const states = awareness.getStates();
      // Only `updated` — a peer refreshing a probe it already held. `added`
      // fires once, the moment this client first learns a peer exists, and
      // that entry's timestamp reflects whenever the peer last stamped it
      // before this client joined, not how long the message spent in
      // transit. Real, but a startup artifact, not propagation latency.
      for (const id of changes.updated) {
        if (id === awareness.clientID) continue; // our own local set, not a delivery
        const probe = (states.get(id) as { probe?: { ts: number } } | undefined)?.probe;
        if (probe) cursorLatencies.push(now - probe.ts);
      }
    });
  }

  let seq = 0;
  const awarenessTimer = setInterval(() => {
    seq += 1;
    const now = Date.now();
    for (const c of live) {
      c.provider.awareness?.setLocalStateField('probe', { ts: now, seq });
    }
  }, AWARENESS_INTERVAL_MS);

  // --- document edits, from the first WRITERS clients ----------------------
  let editSeq = 0;
  const editTimer = setInterval(() => {
    for (const c of live.slice(0, WRITERS)) {
      editSeq += 1;
      const probes = c.doc.getMap<ProbeValue>(PROBE_MAP_KEY);
      probes.set(`${RUN_ID}-${c.index}-${editSeq}`, {
        ts: Date.now(),
        from: c.index,
        runId: RUN_ID,
      });
      editsWritten += 1;
    }
  }, EDIT_INTERVAL_MS);

  // --- optional: one client goes offline mid-test, edits, comes back ------
  if (DISCONNECT_TEST && live.length > 1) {
    const dropped = live[live.length - 1]!;
    setTimeout(() => {
      console.log(`  [disconnect-test] client ${dropped.index} going offline`);
      dropped.socket.disconnect();
      // Everything this client observes until a little after it reconnects is
      // backlog, not live traffic. See Client.offlineUntil.
      dropped.offlineUntil = Date.now() + DISCONNECT_SECONDS * 1000 + SETTLE_MS;
      // Edits made while offline apply to the local Y.Doc regardless — that
      // is the property under test. They queue for the reconnect below.
      const probes = dropped.doc.getMap<ProbeValue>(PROBE_MAP_KEY);
      probes.set(`${RUN_ID}-offline-${dropped.index}`, {
        ts: Date.now(),
        from: dropped.index,
        runId: RUN_ID,
        offline: true,
      });
      offlineUpload.wrote = true;
    }, DURATION_MS * 0.3);

    setTimeout(
      () => {
        console.log(`  [disconnect-test] client ${dropped.index} reconnecting`);
        dropped.socket.connect();
      },
      DURATION_MS * 0.3 + DISCONNECT_SECONDS * 1000,
    );
  }

  await new Promise((r) => setTimeout(r, DURATION_MS));
  clearInterval(awarenessTimer);
  clearInterval(editTimer);

  console.log(`\nSettling for ${SETTLE_MS / 1000}s...`);
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  // --- convergence: does every live client hold the same probe set? -------
  // Scoped to this run's RUN_ID: an earlier run against the same board left
  // its own entries in the doc (the probe map is real, durable Y.Doc state,
  // same as anything else — see RUN_ID's own comment for why), and those
  // are irrelevant to whether *this* run's messages all arrived.
  const idSets = live.map((c) => {
    const map = c.doc.getMap<ProbeValue>(PROBE_MAP_KEY);
    const ids = new Set<string>();
    for (const [key, value] of map.entries()) {
      if (value.runId === RUN_ID) ids.add(key);
    }
    return ids;
  });
  const reference = idSets[0]!;
  let diverged = false;
  for (const set of idSets.slice(1)) {
    if (set.size !== reference.size || [...reference].some((id) => !set.has(id))) {
      diverged = true;
      break;
    }
  }
  const expectedTotal = editsWritten + (DISCONNECT_TEST ? 1 : 0);

  if (DISCONNECT_TEST) {
    // live[0] never disconnects — a clean lens on whether the offline
    // client's edit actually reached the server, not just its own doc.
    offlineUpload.seenByControl = live[0]!.doc
      .getMap(PROBE_MAP_KEY)
      .has(`${RUN_ID}-offline-${live[live.length - 1]!.index}`);
  }

  // --- report ---------------------------------------------------------------
  console.log('\n=== Results ===\n');
  console.log(`Connected:        ${connectedCount}/${USERS}`);
  summarize('Cursor propagation', cursorLatencies);
  summarize('Edit propagation  ', editLatencies);
  console.log(
    `Edits converged:  ${reference.size}/${expectedTotal} on every client` +
      (diverged ? '  ❌ DIVERGED — clients hold different state' : '  ✅'),
  );
  if (DISCONNECT_TEST) {
    console.log(
      `Offline upload:   ${offlineUpload.wrote && offlineUpload.seenByControl ? '✅ reached the server after reconnect' : '❌ did not arrive'}`,
    );
    summarize('Offline edit delivery (queued while disconnected)', offlineEditLatencies);
  }

  console.log("\n=== Against the sprint plan's Sprint 3 exit criteria ===\n");
  const cursorP95 = percentile(
    [...cursorLatencies].sort((a, b) => a - b),
    95,
  );
  const editP95 = percentile(
    [...editLatencies].sort((a, b) => a - b),
    95,
  );
  console.log(
    `Cursor sync p95 <= 80ms:  ${Number.isFinite(cursorP95) ? cursorP95.toFixed(0) + 'ms' : 'n/a'}  ` +
      (cursorP95 <= 80 ? '✅' : '❌'),
  );
  console.log(
    `Edit sync p95 <= 100ms:   ${Number.isFinite(editP95) ? editP95.toFixed(0) + 'ms' : 'n/a'}  ` +
      (editP95 <= 100 ? '✅' : '❌'),
  );
  console.log(`No dropped messages:      ${diverged ? '❌' : '✅'}`);
  console.log(
    `${USERS} concurrent:            ${connectedCount === USERS ? '✅' : `❌ (${connectedCount} connected)`}`,
  );

  for (const c of clients) {
    c.provider.destroy();
    c.socket.destroy();
  }
  process.exit(diverged || connectedCount < USERS ? 1 : 0);
}

main().catch((err) => {
  console.error('load test failed:', err);
  process.exit(1);
});
