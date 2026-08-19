import { randomUUID } from 'node:crypto';
import { Server } from '@hocuspocus/server';
import express from 'express';
import { createClient } from '@canvasflow/db';
import { parseEnv } from './config/env.js';
import { createLogger } from './logging/logger.js';
import { verifyEditorToken } from './auth/verify-token.js';
import { checkBoardAccess } from './auth/check-board-access.js';
import { getAllowedOrigins, isOriginAllowed } from './security/allowed-origins.js';
import * as Y from 'yjs';
import {
  loadSnapshot,
  saveSnapshot,
  EmptyUpdateError,
  UpdateTooLargeError,
} from './persistence/board-updates-store.js';

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
      throw new Error('Access denied');
    }

    // Use the live role, not the one baked into the token — role could
    // have been changed since mint time.
    connLog.info('authenticated', {
      userId: payload.userId,
      email: payload.email,
      boardId: payload.boardId,
      workspaceId: access.workspaceId,
      role: access.role,
    });

    return {
      requestId,
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      boardId: payload.boardId,
      workspaceId: access.workspaceId,
      role: access.role,
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

async function bootstrap(): Promise<void> {
  await hocuspocus.listen();
  log.info('WebSocket listening', { port: env.PORT_WS });

  app.listen(env.PORT_HTTP, () => {
    log.info('HTTP (health) listening', { port: env.PORT_HTTP });
  });

  log.info('sync-server ready', {
    env: env.NODE_ENV,
    allowedOrigins,
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
  await hocuspocus.destroy();
  process.exit(0);
});
