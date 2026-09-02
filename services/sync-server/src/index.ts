import { randomUUID } from 'node:crypto';
import { Server } from '@hocuspocus/server';
import express from 'express';
import { createClient, canEdit } from '@canvasflow/db';
import { parseEnv } from './config/env.js';
import { createLogger } from './logging/logger.js';
import { verifyEditorToken } from './auth/verify-token.js';
import { checkBoardAccess } from './auth/check-board-access.js';
import {
  startReauthorizeLoop,
  reauthorizeUser,
  ACCESS_REVOKED_REASON,
  REAUTHORIZE_INTERVAL_MS,
} from './auth/reauthorize.js';
import { getAllowedOrigins, isOriginAllowed } from './security/allowed-origins.js';
import { INTERNAL_AUTH_HEADER, isInternalCaller } from './security/internal-auth.js';
import { createFanOutExtensions } from './scaling/redis-fan-out.js';
import * as Y from 'yjs';
import {
  loadSnapshot,
  saveSnapshot,
  EmptyUpdateError,
  UpdateTooLargeError,
} from './persistence/board-updates-store.js';

/**
 * What this process last wrote for each room, so an unchanged document is not
 * re-encoded and re-written on every debounce tick.
 *
 * Deliberately per-process. With several instances holding a room, whichever
 * one wins the store lock may not be the one that wrote last, so its entry can
 * be missing or stale and it writes anyway. That costs a redundant snapshot,
 * never a wrong one — the alternative, tracking this in Redis, buys a small
 * saving for a new piece of shared state that could itself go wrong.
 */
const lastPersistedVector = new Map<string, Uint8Array>();

function vectorsEqual(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}

const env = parseEnv();
const allowedOrigins = getAllowedOrigins(env);
const log = createLogger(env, { service: 'sync-server' });
const db = createClient(env.DATABASE_URL);

/**
 * Hocuspocus server configuration with enterprise-grade authentication.
 *
 * onAuthenticate is the security boundary. It runs on every WebSocket
 * handshake and enforces:
 *   1. Origin allowlist (belt-and-suspenders vs CSRF)
 *   2. JWT signature verification
 *   3. Token/room boardId match (can't reuse a token for a different board)
 *   4. Live DB check for current workspace membership
 *
 * User context (userId, boardId, workspaceId, role) is loaded into the
 * connection state and available to downstream hooks as data.context.
 */
const hocuspocus = Server.configure({
  port: env.PORT_WS,

  debounce: 10_000,
  maxDebounce: 30_000,

  /**
   * Empty unless REDIS_URL is set — see createFanOutExtensions.
   *
   * Worth knowing for the store path below: this extension declares a high
   * priority so its own onStoreDocument runs first and takes a short-lived
   * distributed lock. Instances that lose the race have their remaining
   * onStoreDocument hooks skipped, which is what stops every replica holding
   * a room from writing its own snapshot of it.
   */
  extensions: createFanOutExtensions(env.REDIS_URL),

  /**
   * Keep a room in memory after the last client leaves.
   *
   * The default (true) evicts the document the instant the socket closes,
   * so every reconnect — a tab switch, a token refresh, a flaky network —
   * pays a fresh onLoadDocument round trip to Postgres. Holding the room
   * for the debounce window instead makes those reconnects free, which
   * matters most on exactly the connections that drop and return quickly.
   */
  unloadImmediately: false,

  async onAuthenticate(data) {
    const requestId = randomUUID();
    const connLog = log.child({ requestId });

    const origin = data.request.headers.origin;
    if (!isOriginAllowed(origin, allowedOrigins)) {
      connLog.warn('rejected: origin not allowed', { origin });
      throw new Error('Origin not allowed');
    }

    if (!data.token) {
      connLog.warn('rejected: no token provided');
      throw new Error('Authentication required');
    }

    let payload;
    try {
      payload = await verifyEditorToken(data.token, env.AUTH_SECRET);
    } catch (err) {
      connLog.warn('rejected: token verification failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error('Invalid token', { cause: err });
    }

    // Room name (documentName) must match the boardId claim in the token.
    // Prevents a valid token for board A from being used to join board B.
    if (payload.boardId !== data.documentName) {
      connLog.warn('rejected: token/room boardId mismatch', {
        tokenBoardId: payload.boardId,
        requestedRoom: data.documentName,
        userId: payload.userId,
      });
      throw new Error('Token does not match requested board');
    }

    // Live DB check — the token could have been minted 5 minutes ago and
    // access revoked since. Defense in depth: we re-verify on every connect.
    const access = await checkBoardAccess(db, payload.userId, payload.boardId);
    if (!access) {
      connLog.warn('rejected: access revoked since token mint', {
        userId: payload.userId,
        boardId: payload.boardId,
      });
      /**
       * The `reason` rides into the permission-denied frame Hocuspocus writes
       * for a rejected connect, and reaches the client as
       * onAuthenticationFailed({ reason }).
       *
       * Naming it matters because the client's two responses are opposite: a
       * token that has merely lapsed should be re-minted and retried, while
       * this one must not be — retrying is refused every time, and the person
       * needs to be told rather than left watching a reconnect spinner. It
       * covers a deleted board too, which is the same answer from where they
       * are standing.
       */
      throw Object.assign(new Error('Access denied'), { reason: ACCESS_REVOKED_REASON });
    }

    // Use the live role, not the one baked into the token — role could
    // have been changed since mint time.
    const readOnly = !canEdit(access.role);

    /**
     * Mark the connection read-only for viewers.
     *
     * This MUST be a mutation of `data.connection`, not a field on the context
     * object returned below. Hocuspocus reads `hookPayload.connection.readOnly`
     * when it constructs the Connection and when it decides whether to apply an
     * incoming update; anything returned from this hook lands in `data.context`
     * and is never consulted for authorization. Returning `readOnly` looks
     * exactly like enforcement and does nothing at all — a viewer's edits were
     * applied and broadcast like anyone else's.
     */
    data.connection.readOnly = readOnly;

    connLog.info('authenticated', {
      userId: payload.userId,
      email: payload.email,
      boardId: payload.boardId,
      workspaceId: access.workspaceId,
      role: access.role,
      source: access.source,
      readOnly,
    });

    return {
      requestId,
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      boardId: payload.boardId,
      workspaceId: access.workspaceId,
      role: access.role,
      // Informational only — the enforcement is data.connection.readOnly above.
      // Kept so downstream hooks can log why a write never arrived.
      readOnly,
    };
  },
  /**
   * Load persisted state on room entry.
   *
   * Fires once per room, when the first client joins. Reads the board's
   * persisted state from Postgres as a single merged update and applies it
   * to the document Hocuspocus is about to hand out to clients.
   *
   * Note this hook does NOT communicate state via its return value the way
   * a `fetch`-style API would: Hocuspocus ignores a returned Uint8Array and
   * only honours a returned Y.Doc. Applying updates straight onto
   * data.document is the supported path, so that is what we do.
   *
   * On error: log and leave the document empty. Clients still function; they
   * just don't see prior history. Preferable to throwing, which Hocuspocus
   * treats as fatal — it closes every connection for the room, leaving users
   * staring at "sync error" over a transient DB blip.
   */
  async onLoadDocument(data) {
    const documentName = data.documentName;
    const startedAt = Date.now();

    try {
      const snapshot = await loadSnapshot(db, documentName);

      if (!snapshot) {
        log.info('fetch: no prior state', { boardId: documentName });
        return data.document;
      }

      Y.applyUpdate(data.document, snapshot);

      // Seed the skip guard: the document currently matches what is in
      // Postgres, so the first onStoreDocument has nothing to write unless
      // a client actually edits something.
      lastPersistedVector.set(documentName, Y.encodeStateVector(data.document));

      log.info('fetch: loaded prior state', {
        boardId: documentName,
        snapshotBytes: snapshot.length,
        loadMs: Date.now() - startedAt,
      });

      return data.document;
    } catch (err) {
      log.error('load: failed, starting empty', {
        boardId: documentName,
        error: err instanceof Error ? err.message : String(err),
      });
      return data.document;
    }
  },

  // NOTE: there is deliberately no onConnect hook. Hocuspocus fires it on
  // the first message *before* awaiting onAuthenticate (handleQueueingMessage
  // is not awaited), so data.context is empty there on every connection —
  // successful ones included. A log line in onConnect can only ever emit
  // without userId/boardId, and appears before rejections too. The
  // 'authenticated' log below is the real connect signal.

  async onDisconnect(data) {
    const ctx = data.context as
      | { requestId: string; userId: string; boardId: string }
      | Record<string, never>;
    if (!ctx.userId) return;

    log.info('disconnected', {
      requestId: ctx.requestId,
      userId: ctx.userId,
      boardId: ctx.boardId,
    });
  },

  /**
   * A room is gone from memory, so its cached state vector is stale — the
   * next load re-seeds it from Postgres. Dropping it here is what keeps
   * lastPersistedVector bounded by live rooms rather than by every board
   * this process has ever served.
   */
  async afterUnloadDocument(data) {
    lastPersistedVector.delete(data.documentName);
  },

  async onChange(data) {
    const ctx = data.context as
      | { requestId: string; userId: string; boardId: string }
      | Record<string, never>;
    if (!ctx.userId) return;

    log.debug('doc changed', {
      requestId: ctx.requestId,
      userId: ctx.userId,
      boardId: ctx.boardId,
      updateBytes: data.update.length,
    });
    // PR #28: persist to Postgres here
  },

  /**
   * Persist the current document state.
   *
   * Debounced by the cadence configured above, so a burst of edits settles
   * into one write rather than a write per Yjs update. That write replaces
   * the board's previous snapshot instead of appending to a log — see
   * saveSnapshot for why the old rows are pruned.
   *
   * On error: log and continue. In-memory state is preserved; the next
   * successful save catches up. Losing the very last save on a server
   * crash is an accepted trade-off.
   */
  async onStoreDocument(data) {
    const ctx = data.context as
      | { requestId: string; userId: string; boardId: string }
      | Record<string, never>;

    // Same guard as onDisconnect/onChange — Hocuspocus can invoke this
    // for connections that never authenticated.
    if (!ctx.userId) return;

    // Nothing new since the last save? Then the round trip would write
    // bytes Postgres already has. See lastPersistedVector.
    const vector = Y.encodeStateVector(data.document);
    if (vectorsEqual(lastPersistedVector.get(data.documentName), vector)) {
      log.debug('skipped unchanged document', {
        requestId: ctx.requestId,
        boardId: ctx.boardId,
      });
      return;
    }

    const update = Y.encodeStateAsUpdate(data.document);

    try {
      await saveSnapshot(db, ctx.boardId, ctx.userId, update);
      lastPersistedVector.set(data.documentName, vector);
      log.info('persisted document state', {
        requestId: ctx.requestId,
        boardId: ctx.boardId,
        userId: ctx.userId,
        bytes: update.length,
      });
    } catch (err) {
      if (err instanceof EmptyUpdateError) {
        log.debug('skipped empty update', {
          requestId: ctx.requestId,
          boardId: ctx.boardId,
        });
        return;
      }
      if (err instanceof UpdateTooLargeError) {
        log.warn('rejected oversized update', {
          requestId: ctx.requestId,
          boardId: ctx.boardId,
          bytes: update.length,
        });
        return;
      }
      log.error('failed to persist document state', {
        requestId: ctx.requestId,
        boardId: ctx.boardId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

/**
 * Separate HTTP server for health checks. Hocuspocus owns the WS port;
 * we run Express on a separate port for HTTP-only routes.
 */
const app = express();

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    connections: hocuspocus.getConnectionsCount(),
    documents: hocuspocus.getDocumentsCount(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * "This person's access to this board just changed — look at them now."
 *
 * Called by the web app the moment an owner removes someone or moves them
 * between editor and viewer. It carries no authority of its own: the board id
 * and user id only say where to look, and the answer still comes from
 * resolveBoardAccess against the database. A forged call can therefore do
 * nothing worse than make this service re-read a row it was going to re-read
 * within five seconds anyway — which is why the shared secret below is enough
 * and this needs no user session.
 *
 * The periodic sweep remains the guarantee. This is what makes the common case
 * feel immediate instead of taking up to one sweep interval.
 */
app.post('/internal/board-access', express.json({ limit: '1kb' }), async (req, res) => {
  if (!isInternalCaller(req.headers[INTERNAL_AUTH_HEADER], env.AUTH_SECRET)) {
    log.warn('rejected internal call: bad or missing credential');
    res.status(401).json({ error: 'Not authorized' });
    return;
  }

  const body = req.body as { boardId?: unknown; userId?: unknown };
  const boardId = typeof body.boardId === 'string' ? body.boardId : null;
  const userId = typeof body.userId === 'string' ? body.userId : null;

  if (!boardId || !userId) {
    res.status(400).json({ error: 'boardId and userId are required' });
    return;
  }

  try {
    const outcome = await reauthorizeUser({ server: hocuspocus, db, log }, boardId, userId);
    log.info('re-authorized on request', { boardId, userId, ...outcome });
    res.json({ ok: true, ...outcome });
  } catch (err) {
    // The caller treats this as advisory and does not retry — the sweep will
    // reach the same connections shortly.
    log.error('internal re-authorization failed', {
      boardId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Re-authorization failed' });
  }
});

let stopReauthorize: (() => void) | null = null;

async function bootstrap(): Promise<void> {
  await hocuspocus.listen();
  log.info('WebSocket listening', { port: env.PORT_WS });

  // Access is resolved at connect time, which would otherwise let someone
  // demoted to viewer keep writing until they happened to reconnect. This
  // re-checks live connections so a role change lands on the session the
  // person is actually in.
  stopReauthorize = startReauthorizeLoop({ server: hocuspocus, db, log });
  log.info('re-authorization sweep started', { intervalMs: REAUTHORIZE_INTERVAL_MS });

  app.listen(env.PORT_HTTP, () => {
    log.info('HTTP (health) listening', { port: env.PORT_HTTP });
  });

  log.info('sync-server ready', {
    env: env.NODE_ENV,
    allowedOrigins,
    // Single-instance is a valid way to run this, but running several
    // replicas without fan-out is not — so make which one it is visible in
    // the logs rather than something you infer from a config file.
    fanOut: env.REDIS_URL ? 'redis' : 'none (single instance only)',
  });
}

bootstrap().catch((err) => {
  log.error('fatal: failed to start sync-server', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down');
  stopReauthorize?.();
  await hocuspocus.destroy();
  process.exit(0);
});
