import { randomUUID } from 'node:crypto';
import { Server } from '@hocuspocus/server';
import express from 'express';
import { createClient } from '@canvasflow/db';
import { parseEnv } from './config/env.js';
import { createLogger } from './logging/logger.js';
import { verifyEditorToken } from './auth/verify-token.js';
import { checkBoardAccess } from './auth/check-board-access.js';
import { getAllowedOrigins, isOriginAllowed } from './security/allowed-origins.js';

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
