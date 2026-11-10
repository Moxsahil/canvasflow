// Shared helpers for the local-only metric scripts.
// Every dependency is resolved from the workspace packages that already ship
// it, so these scripts use the exact same yjs / provider / pg the app uses.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');

const fromSync = createRequire(resolve(ROOT, 'services/sync-server/package.json'));
const fromDb = createRequire(resolve(ROOT, 'packages/db/package.json'));

export const Y = fromSync('yjs');
export const { HocuspocusProvider, HocuspocusProviderWebsocket } = fromSync('@hocuspocus/provider');
export const WS = fromSync('ws');

/**
 * The provider the editor itself ships (apps/editor's @hocuspocus/provider),
 * which can be a different major version from the sync-server's. Loaded on
 * request, for scripts that measure client behaviour such as reconnecting.
 */
export function editorProvider() {
  const fromEditor = createRequire(resolve(ROOT, 'apps/editor/package.json'));
  const entry = fromEditor.resolve('@hocuspocus/provider');
  const pkgPath = resolve(entry.slice(0, entry.lastIndexOf('/dist/')), 'package.json');
  return { ...fromEditor('@hocuspocus/provider'), version: fromEditor(pkgPath).version };
}
export const pg = fromDb('pg');

export const PG_PORT = 54329;
export const LOCAL_DB_URL = `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/canvasflow`;
// Local-only secret; never used anywhere but this machine.
export const LOCAL_AUTH_SECRET = 'local-metrics-secret-not-used-anywhere-else-000000';
/**
 * The local sync-server the scripts start and talk to. 4000 by default;
 * METRICS_SYNC_PORT moves it (and its HTTP port, one above) off the dev
 * server's ports when that is running.
 */
export const SYNC_PORT = Number(process.env.METRICS_SYNC_PORT ?? 4000);
export const SYNC_HTTP_PORT = SYNC_PORT + 1;
export const SYNC_URL = `ws://127.0.0.1:${SYNC_PORT}`;
export const ORIGIN = 'http://localhost:3002';

/** Refuse to run against anything that is not this machine. */
export function assertLocal(url) {
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    console.error(`REFUSING: ${host} is not local`);
    process.exit(2);
  }
}
assertLocal(LOCAL_DB_URL);
assertLocal(SYNC_URL.replace('ws:', 'http:'));

export async function jose() {
  const p = fromSync.resolve('jose');
  return import(p);
}

/** Mint a board token with the same claims as apps/web/src/lib/auth/editor-token.ts. */
export async function mintToken(seed, name = 'Metrics') {
  const { SignJWT } = await jose();
  return new SignJWT({
    sid: seed.sessionId,
    id: seed.userId,
    email: seed.email,
    name,
    isGuest: false,
    boardId: seed.boardId,
    workspaceId: seed.workspaceId,
    role: 'owner',
    accessSource: 'owner',
    archived: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor((Date.now() + 60 * 60 * 1000) / 1000))
    .setIssuedAt()
    .sign(new TextEncoder().encode(LOCAL_AUTH_SECRET));
}

export class OriginWebSocket extends WS {
  constructor(address) {
    super(address, [], { headers: { origin: ORIGIN } });
  }
}

/** Connect one provider; resolves once authenticated and synced. */
export function connectClient(
  token,
  boardId,
  { maxAttempts = 0, timeoutMs = 20000, backoff = {}, provider: classes } = {},
) {
  const Websocket = classes?.HocuspocusProviderWebsocket ?? HocuspocusProviderWebsocket;
  const Provider = classes?.HocuspocusProvider ?? HocuspocusProvider;
  const doc = new Y.Doc();
  const socket = new Websocket({
    url: SYNC_URL,
    WebSocketPolyfill: OriginWebSocket,
    maxAttempts,
    // Only what the caller sets; the rest stays at the provider's defaults.
    ...backoff,
  });
  let ok, fail;
  const ready = new Promise((a, b) => ((ok = a), (fail = b)));
  const provider = new Provider({
    websocketProvider: socket,
    name: boardId,
    document: doc,
    token,
    onSynced: () => ok(),
    onAuthenticationFailed: ({ reason }) => fail(new Error(`auth failed: ${reason}`)),
  });
  // Provider 3+ only listens to a socket it was handed once attached.
  if (typeof provider.attach === 'function') provider.attach();
  const timer = setTimeout(() => fail(new Error('timeout')), timeoutMs);
  ready.finally(() => clearTimeout(timer)).catch(() => {});
  return { doc, socket, provider, ready };
}

export function destroyClient(c) {
  try {
    c.provider.destroy();
    c.socket.destroy();
  } catch {}
}

export function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return { n: 0 };
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  // nearest-rank p95
  const p95 = s[Math.ceil(0.95 * n) - 1];
  return { n, min: s[0], median, p95, max: s[n - 1] };
}

export function env() {
  return {
    node: process.version,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memGB: Math.floor(os.totalmem() / 1e9),
    platform: `${os.platform()} ${os.release()}`,
    date: new Date().toISOString(),
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
