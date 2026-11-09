// One load-generator process: holds a slice of the simulated clients.
//
// Started by coordinator.mjs with an IPC channel; never run by hand. Every
// client is a real @hocuspocus/provider with its own WebSocket, behaving like
// an open editor tab: it authenticates with a board token, publishes a
// presence record and renews it when the server asks (the editor's
// presence-renew answer), and the chosen writers edit the document.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { ORIGIN, load, mintToken, sleep, wallNow } from './lib.mjs';

const Y = load('yjs');
const WS = load('ws');
const { HocuspocusProvider, HocuspocusProviderWebsocket } = load('@hocuspocus/provider');

class OriginWebSocket extends WS {
  constructor(address) {
    super(address, [], { headers: { origin: ORIGIN } });
  }
}

const PROBES = '__scaling_probes__';
/** Same freshness rule as the editor's renewPresence (WebSocketSync.PRESENCE_FRESH_MS). */
const PRESENCE_FRESH_MS = 8_000;

const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();

let config;
const clients = [];
const latencies = [];
let received = 0;
let disconnects = 0;

function send(msg) {
  process.send(msg);
}

function presenceFor(index) {
  // Shaped like the editor's PresenceState for an idle viewer.
  return {
    user: { id: config.seed.userId, name: `Load ${index}`, color: 'blue', username: null },
    cursor: null,
    camera: { x: 0, y: 0, zoom: 1 },
    screen: { width: 1440, height: 900 },
    selection: [],
    activity: 'idle',
    lastActive: Date.now(),
  };
}

function openClient(index, token) {
  const doc = new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({
    url: config.url,
    WebSocketPolyfill: OriginWebSocket,
    maxAttempts: 0,
  });
  const client = {
    index,
    doc,
    socket,
    provider: null,
    synced: false,
    error: null,
    received: 0,
    fromWriter: {},
  };
  const t0 = wallNow();
  client.ready = new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.error ??= 'timeout';
      resolve();
    }, config.connectTimeoutMs);
    client.provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: config.seed.boardId,
      document: doc,
      token,
      onSynced: () => {
        if (client.synced) return;
        client.synced = true;
        client.connectMs = wallNow() - t0;
        clearTimeout(timer);
        if (config.presence) {
          client.provider.awareness?.setLocalStateField('presence', presenceFor(index));
        }
        resolve();
      },
      onAuthenticationFailed: ({ reason }) => {
        client.error = `auth failed: ${reason}`;
        clearTimeout(timer);
        resolve();
      },
      onStateless: ({ payload }) => {
        if (!config.presence) return;
        try {
          if (JSON.parse(payload).type !== 'presence-renew') return;
        } catch {
          return;
        }
        const awareness = client.provider.awareness;
        const local = awareness?.getLocalState();
        if (!local) return;
        const renewedAt = awareness.meta.get(awareness.clientID)?.lastUpdated ?? 0;
        if (Date.now() - renewedAt < PRESENCE_FRESH_MS) return;
        awareness.setLocalState(local);
      },
      onDisconnect: () => {
        if (client.synced) disconnects++;
      },
    });
  });

  doc.getMap(PROBES).observe((event) => {
    const now = wallNow();
    for (const [key, change] of event.changes.keys) {
      if (change.action !== 'add' || !key.startsWith(config.runTag)) continue;
      const value = doc.getMap(PROBES).get(key);
      if (!value || value.from === index) continue;
      received++;
      client.received++;
      client.fromWriter[value.from] = (client.fromWriter[value.from] ?? 0) + 1;
      latencies.push(now - value.ts);
    }
  });
  return client;
}

async function connectAll() {
  const { count, firstIndex, rampPerSec } = config;
  const tickMs = 50;
  const perTick = Math.max(1, Math.round((rampPerSec * tickMs) / 1000));
  const tokens = await Promise.all(
    Array.from({ length: count }, (_, i) => mintToken(config.seed, `Load ${firstIndex + i}`)),
  );
  for (let i = 0; i < count; i += perTick) {
    for (let j = i; j < Math.min(count, i + perTick); j++) {
      clients.push(openClient(firstIndex + j, tokens[j]));
    }
    await sleep(tickMs);
  }
  await Promise.all(clients.map((c) => c.ready));
  const live = clients.filter((c) => c.synced);
  const errors = {};
  for (const c of clients) if (!c.synced) errors[c.error] = (errors[c.error] ?? 0) + 1;
  send({
    type: 'connected',
    connected: live.length,
    failed: clients.length - live.length,
    errors,
    connectMs: live.map((c) => c.connectMs),
  });
}

async function writeAll() {
  const writers = clients.filter((c) => c.synced && config.writers.includes(c.index));
  const rounds = Math.floor((config.editSeconds * 1000) / config.editGapMs);
  let sent = 0;
  const perWriter = Object.fromEntries(writers.map((w) => [w.index, 0]));
  const start = wallNow();
  for (let r = 0; r < rounds; r++) {
    for (const w of writers) {
      w.doc
        .getMap(PROBES)
        .set(`${config.runTag}-${w.index}-${r}`, { ts: wallNow(), from: w.index });
      sent++;
      perWriter[w.index]++;
    }
    // Keep to the schedule even when the event loop is busy, so a slow
    // generator sends late rather than sending less.
    const next = start + (r + 1) * config.editGapMs;
    await sleep(Math.max(0, next - wallNow()));
  }
  send({ type: 'written', sent, perWriter, writers: writers.length });
}

process.on('message', async (msg) => {
  if (msg.type === 'config') {
    config = msg.config;
    connectAll().catch((err) => send({ type: 'error', error: String(err?.stack ?? err) }));
  } else if (msg.type === 'write') {
    writeAll().catch((err) => send({ type: 'error', error: String(err?.stack ?? err) }));
  } else if (msg.type === 'progress') {
    send({ type: 'progress', received });
  } else if (msg.type === 'report') {
    const mem = process.memoryUsage();
    send({
      type: 'report',
      received,
      latencies,
      // Per client: how many deliveries arrived from each writer. A client
      // missing one writer's edits entirely points at a split room rather
      // than at slowness.
      perClient: clients
        .filter((c) => c.synced)
        .map((c) => ({ index: c.index, fromWriter: c.fromWriter })),
      disconnects,
      loopLagMs: {
        p50: lag.percentile(50) / 1e6,
        p99: lag.percentile(99) / 1e6,
        max: lag.max / 1e6,
      },
      cpuMs: process.cpuUsage().user / 1000 + process.cpuUsage().system / 1000,
      rssMB: Math.round(mem.rss / 1e6),
    });
  } else if (msg.type === 'close') {
    for (const c of clients) {
      try {
        c.provider.destroy();
        c.socket.destroy();
      } catch {}
    }
    setTimeout(() => process.exit(0), 200);
  }
});
