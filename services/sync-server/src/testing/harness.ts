import { randomUUID } from 'node:crypto';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { createClient, type Database } from '@canvasflow/db';
import { SignJWT } from 'jose';
import { inject } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import { createSyncServer, type SyncServer, type SyncServerOptions } from '../server.js';

export const AUTH_SECRET = 'sync-server-tests-only-secret-0000000000000000';
export const ALLOWED_ORIGIN = 'http://localhost:3002';

/** The test database, refusing anything that is not this machine. */
export function testDatabaseUrl(): string {
  const url = inject('databaseUrl');
  if (new URL(url).hostname !== '127.0.0.1') throw new Error(`refusing non-local database: ${url}`);
  return url;
}

export function testDb(): Database {
  return createClient(testDatabaseUrl());
}

/** The pg pool under a client. The runtime value drizzle keeps; its 0.36 types do not declare it. */
export interface PoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}
export const poolOf = (db: Database) => (db as unknown as { $client: PoolLike }).$client;

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const result = await poolOf(testDb()).query(text, params);
  return result.rows as T[];
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
  meta: Record<string, unknown>;
}

/** A Logger that keeps every line, so a test can say which check rejected a connection. */
export function captureLogger(
  entries: LogEntry[] = [],
  base: Record<string, unknown> = {},
): Logger & {
  entries: LogEntry[];
} {
  const write = (level: LogEntry['level']) => (msg: string, meta?: Record<string, unknown>) => {
    entries.push({ level, msg, meta: { ...base, ...meta } });
    if (process.env.SYNC_TEST_LOGS) console.warn(level, msg, { ...base, ...meta });
  };
  return {
    entries,
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (context) => captureLogger(entries, { ...base, ...context }),
  };
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    PORT_WS: 0,
    PORT_HTTP: 0,
    AUTH_SECRET,
    DATABASE_URL: testDatabaseUrl(),
    LOG_LEVEL: 'debug',
    ...overrides,
  };
}

export interface RunningServer {
  server: SyncServer;
  log: ReturnType<typeof captureLogger>;
  wsPort: number;
  httpPort: number;
  url: string;
  stop: () => Promise<void>;
}

/** A real sync-server on loopback, with short store debounces unless told otherwise. */
export async function startServer(
  options: SyncServerOptions & { env?: Partial<Env> } = {},
): Promise<RunningServer> {
  const log = captureLogger();
  const server = createSyncServer(testEnv(options.env), {
    debounce: 200,
    maxDebounce: 1_000,
    ...options,
    log,
  });
  const { wsPort, httpPort } = await server.start();
  let stopped = false;
  return {
    server,
    log,
    wsPort,
    httpPort,
    url: `ws://127.0.0.1:${wsPort}`,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await server.stop();
    },
  };
}

export interface Seed {
  workspaceId: string;
  owner: { userId: string; sessionId: string };
  member: { userId: string; sessionId: string };
  viewer: { userId: string; sessionId: string };
  boardId: string;
  otherBoardId: string;
}

async function person(label: string) {
  const [user] = await sql<{ id: string }>(
    `insert into users (email, name) values ($1, $2) returning id`,
    [`${label}-${randomUUID()}@sync-test.local`, label],
  );
  const [session] = await sql<{ id: string }>(
    `insert into auth_sessions (user_id, expires_at) values ($1, now() + interval '1 day') returning id`,
    [user!.id],
  );
  return { userId: user!.id, sessionId: session!.id };
}

/**
 * One workspace with two boards, its owner, a workspace member (an editor of
 * both boards through the workspace) and a viewer invited to the first board.
 */
export async function seed(): Promise<Seed> {
  const owner = await person('owner');
  const member = await person('member');
  const viewer = await person('viewer');
  const [ws] = await sql<{ id: string }>(
    `insert into workspace (name, slug) values ('Sync tests', $1) returning id`,
    [`sync-tests-${randomUUID()}`],
  );
  await sql(
    `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`,
    [ws!.id, owner.userId, member.userId],
  );
  const [board] = await sql<{ id: string }>(
    `insert into boards (workspace_id, title, owner_id) values ($1, 'Board', $2) returning id`,
    [ws!.id, owner.userId],
  );
  const [other] = await sql<{ id: string }>(
    `insert into boards (workspace_id, title, owner_id) values ($1, 'Other board', $2) returning id`,
    [ws!.id, owner.userId],
  );
  await sql(
    `insert into board_members (board_id, user_id, role, granted_by) values ($1, $2, 'viewer', $3)`,
    [board!.id, viewer.userId, owner.userId],
  );
  return {
    workspaceId: ws!.id,
    owner,
    member,
    viewer,
    boardId: board!.id,
    otherBoardId: other!.id,
  };
}

export interface TokenClaims {
  userId: string;
  sessionId?: string | null;
  boardId: string;
  workspaceId: string;
  role?: 'owner' | 'editor' | 'viewer';
  secret?: string;
  /** Seconds since the epoch; defaults to five minutes from now. */
  expiresAt?: number;
}

/** A board token with the claims the web app mints (apps/web/src/lib/auth/editor-token.ts). */
export async function mintToken(claims: TokenClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    id: claims.userId,
    ...(claims.sessionId ? { sid: claims.sessionId } : {}),
    email: 'person@sync-test.local',
    name: 'Person',
    isGuest: false,
    boardId: claims.boardId,
    workspaceId: claims.workspaceId,
    role: claims.role ?? 'owner',
    accessSource: 'owner',
    archived: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now - 1)
    .setExpirationTime(claims.expiresAt ?? now + 300)
    .sign(new TextEncoder().encode(claims.secret ?? AUTH_SECRET));
}

export interface Client {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  socket: HocuspocusProviderWebsocket;
  /** Resolves on the first sync; rejects with the server's reason if authentication fails. */
  ready: Promise<void>;
  destroy: () => void;
}

export function connect(
  url: string,
  boardId: string,
  token: string,
  { origin = ALLOWED_ORIGIN, maxAttempts = 0 }: { origin?: string; maxAttempts?: number } = {},
): Client {
  class OriginWebSocket extends WebSocket {
    constructor(address: string) {
      super(address, [], { headers: { origin } });
    }
  }
  const doc = new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({
    url,
    WebSocketPolyfill: OriginWebSocket,
    maxAttempts,
    // Back off quickly so reconnect tests do not sit on the production delays.
    delay: 100,
    minDelay: 100,
    maxDelay: 500,
    factor: 1.5,
  });
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const ready = new Promise<void>((a, b) => {
    resolve = a;
    reject = b;
  });
  ready.catch(() => {});
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: boardId,
    document: doc,
    token,
    onSynced: () => resolve(),
    onAuthenticationFailed: ({ reason }) => reject(new Error(reason)),
  });
  return {
    doc,
    provider,
    socket,
    ready,
    destroy: () => {
      provider.destroy();
      socket.destroy();
    },
  };
}

export async function waitFor<T>(
  check: () => T | Promise<T>,
  { timeout = 10_000, interval = 25, what = 'condition' } = {},
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value as NonNullable<T>;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

function varUint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}

function varString(text: string): number[] {
  const bytes = [...Buffer.from(text, 'utf8')];
  return [...varUint(bytes.length), ...bytes];
}

/**
 * Sends one hand-built Hocuspocus auth message, for the cases a real provider
 * refuses to send (an empty token). Frame: room name, message type 2 (auth),
 * auth type 0 (token), token. Resolves when the server closes or answers.
 */
export function rawAuth(url: string, room: string, token: string, origin = ALLOWED_ORIGIN) {
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(url, [], { headers: { origin } });
    const done = () => {
      ws.close();
      resolve();
    };
    ws.on('open', () => ws.send(Buffer.from([...varString(room), 2, 0, ...varString(token)])));
    ws.on('message', done);
    ws.on('close', done);
    ws.on('error', reject);
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The board as Postgres has it: the retention window merged, like loadSnapshot reads it. */
export async function storedDoc(boardId: string): Promise<{ doc: Y.Doc; rows: number }> {
  const rows = await sql<{ update: Buffer }>(
    `select "update" from board_updates where board_id = $1 order by created_at desc limit 3`,
    [boardId],
  );
  const doc = new Y.Doc();
  if (rows.length > 0)
    Y.applyUpdate(doc, Y.mergeUpdates(rows.map((r) => new Uint8Array(r.update))));
  return { doc, rows: rows.length };
}

export async function rowCount(boardId: string): Promise<number> {
  const [row] = await sql<{ n: string }>(
    `select count(*)::text as n from board_updates where board_id = $1`,
    [boardId],
  );
  return Number(row!.n);
}
