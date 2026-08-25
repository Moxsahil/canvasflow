import { canEdit, resolveBoardAccess, type BoardRole, type Database } from '@canvasflow/db';
import type { Connection, Hocuspocus } from '@hocuspocus/server';
import type { Logger } from '../logging/logger.js';

/** How often to re-check. Fast enough to feel immediate, slow enough to ignore. */
export const REAUTHORIZE_INTERVAL_MS = 5_000;

/**
 * Sent to a client whose permissions changed underneath it, so it can re-mint
 * its token and update its own UI rather than waiting out the token's lifetime.
 */
export interface AccessChangedMessage {
  type: 'access-changed';
  role: BoardRole;
  canEdit: boolean;
}

/**
 * Sent to a client that no longer has any access at all, immediately before
 * its socket is closed.
 *
 * Closing on its own is enforcement but not communication: the provider treats
 * a closed socket as a network blip and reconnects, so the person is left
 * looking at a board that still renders from their local document while every
 * edit quietly goes nowhere. This says which of the two it is, and the editor
 * stops reconnecting and tells them.
 */
export interface AccessRevokedMessage {
  type: 'access-revoked';
}

/** The reason written into the permission-denied frame when a connect is refused. */
export const ACCESS_REVOKED_REASON = 'access-revoked';

interface ConnectionContext {
  userId?: string;
  boardId?: string;
  role?: BoardRole;
  requestId?: string;
}

export interface ReauthorizeDeps {
  server: Hocuspocus;
  db: Database;
  log: Logger;
}

/** What a single re-check did, mostly so the internal route can report it. */
export type ReauthorizeOutcome = 'revoked' | 'changed' | 'unchanged' | 'skipped' | 'failed';

/**
 * Re-check one live connection and bring it in line with the database.
 *
 * The unit of work behind both the periodic sweep and the targeted call the
 * web app makes the moment an owner changes something — same decision, same
 * messages, so a revocation cannot behave one way when pushed and another way
 * when discovered.
 */
export async function reauthorizeConnection(
  connection: Connection,
  { db, log }: Omit<ReauthorizeDeps, 'server'>,
): Promise<ReauthorizeOutcome> {
  const context = connection.context as ConnectionContext;
  const { userId, boardId } = context;

  // Connections that never authenticated carry no context; Hocuspocus can
  // hand those to hooks before onAuthenticate has resolved.
  if (!userId || !boardId) return 'skipped';

  try {
    const access = await resolveBoardAccess(db, userId, boardId);

    if (!access) {
      log.info('access revoked, closing connection', { userId, boardId });

      // Sealed before anything else, so nothing can land in the window
      // between telling them and the socket actually going away.
      connection.readOnly = true;

      const message: AccessRevokedMessage = { type: 'access-revoked' };
      connection.sendStateless(JSON.stringify(message));

      // Ordering holds: the WebSocket close frame queues behind data already
      // handed to the socket, so the message above is delivered rather than
      // discarded with the connection.
      connection.close();
      return 'revoked';
    }

    const shouldBeReadOnly = !canEdit(access.role);
    const wasReadOnly = Boolean(connection.readOnly);

    if (shouldBeReadOnly === wasReadOnly && context.role === access.role) return 'unchanged';

    log.info('role changed mid-session', {
      userId,
      boardId,
      from: context.role,
      to: access.role,
      readOnly: shouldBeReadOnly,
    });

    // Mutating the live connection is what makes this take effect without a
    // reconnect: Hocuspocus consults this flag on every incoming update.
    connection.readOnly = shouldBeReadOnly;
    context.role = access.role;

    const message: AccessChangedMessage = {
      type: 'access-changed',
      role: access.role,
      canEdit: !shouldBeReadOnly,
    };
    connection.sendStateless(JSON.stringify(message));
    return 'changed';
  } catch (error) {
    // A database blip must not close anyone's board. Skip this connection
    // and re-check it on the next pass.
    log.warn('re-authorization check failed, leaving connection as-is', {
      userId,
      boardId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'failed';
  }
}

/**
 * Run one pass over every open connection.
 *
 * Exported separately from the scheduler so it can be driven directly in a
 * test, and so a caller can force a pass without waiting for the next tick.
 */
export async function reauthorizeOnce({ server, db, log }: ReauthorizeDeps): Promise<void> {
  for (const document of server.documents.values()) {
    for (const connection of document.getConnections()) {
      await reauthorizeConnection(connection, { db, log });
    }
  }
}

/**
 * Re-check just one person's connections to one board.
 *
 * The push half of the design. The sweep below still exists and still catches
 * everything, but a five-second worst case is five seconds of someone drawing
 * on a board they were removed from; this closes that gap for the case we can
 * actually observe — the owner clicking the button.
 *
 * Returns how many connections it touched, so the caller can tell "nobody was
 * connected" from "we told them".
 */
export async function reauthorizeUser(
  { server, db, log }: ReauthorizeDeps,
  boardId: string,
  userId: string,
): Promise<{ matched: number; revoked: number; changed: number }> {
  const document = server.documents.get(boardId);
  if (!document) return { matched: 0, revoked: 0, changed: 0 };

  let matched = 0;
  let revoked = 0;
  let changed = 0;

  // getConnections() hands back a fresh array, which matters here: closing a
  // connection deregisters it from the document mid-loop.
  for (const connection of document.getConnections()) {
    const context = connection.context as ConnectionContext;
    if (context.userId !== userId) continue;

    matched += 1;
    const outcome = await reauthorizeConnection(connection, { db, log });
    if (outcome === 'revoked') revoked += 1;
    if (outcome === 'changed') changed += 1;
  }

  return { matched, revoked, changed };
}

/** Start the sweep. Returns a stop function for shutdown. */
export function startReauthorizeLoop(deps: ReauthorizeDeps): () => void {
  const timer = setInterval(() => {
    void reauthorizeOnce(deps);
  }, REAUTHORIZE_INTERVAL_MS);

  // Never hold the process open for a periodic check.
  timer.unref?.();

  return () => clearInterval(timer);
}
