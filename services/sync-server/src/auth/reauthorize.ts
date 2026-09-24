import {
  canEdit,
  liveSessionIds,
  resolveBoardAccess,
  type BoardRole,
  type Database,
} from '@canvasflow/db';
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

/**
 * Sent to a client whose signed-in session has been ended — signed out,
 * signed out everywhere, or swept away by a password reset — immediately
 * before its socket is closed.
 *
 * Kept apart from `access-revoked` because the right response is different:
 * the person has not lost the board, they have lost their session, and the
 * editor should send them to sign in rather than tell them the board is gone.
 */
export interface SessionEndedMessage {
  type: 'session-ended';
}

/**
 * The reason written into the permission-denied frame when a connect is
 * refused because the token's session has ended. Kept in step with
 * SESSION_ENDED_REASON in the editor's WebSocketSync.
 */
export const SESSION_ENDED_REASON = 'session-ended';

interface ConnectionContext {
  userId?: string;
  boardId?: string;
  role?: BoardRole;
  requestId?: string;
  /** The signed-in session behind the token; absent for a guest. */
  sessionId?: string | null;
}

export interface ReauthorizeDeps {
  server: Hocuspocus;
  db: Database;
  log: Logger;
}

/** What a single re-check did, mostly so the internal route can report it. */
export type ReauthorizeOutcome =
  | 'revoked'
  | 'ended'
  | 'changed'
  | 'unchanged'
  | 'skipped'
  | 'failed';

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
  /**
   * The sessions known to still stand, read once for the whole sweep. Omitted
   * by callers that are only asking about board access; undefined means "not
   * checked", never "none live".
   */
  liveSessions?: Set<string>,
): Promise<ReauthorizeOutcome> {
  const context = connection.context as ConnectionContext;
  const { userId, boardId } = context;

  // Connections that never authenticated carry no context; Hocuspocus can
  // hand those to hooks before onAuthenticate has resolved.
  if (!userId || !boardId) return 'skipped';

  // A session that has ended takes its connections with it, whatever the
  // board says: the person may still have access to this board, but not
  // through a session that has been signed out or reset away.
  if (context.sessionId && liveSessions && !liveSessions.has(context.sessionId)) {
    log.info('session ended, closing connection', { userId, boardId });
    close(connection, { type: 'session-ended' } satisfies SessionEndedMessage);
    return 'ended';
  }

  try {
    const access = await resolveBoardAccess(db, userId, boardId);

    if (!access) {
      log.info('access revoked, closing connection', { userId, boardId });
      close(connection, { type: 'access-revoked' } satisfies AccessRevokedMessage);
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
 * Tell a client why, then close its socket.
 *
 * Sealed read-only before anything else, so nothing can land in the window
 * between telling them and the socket actually going away. Ordering holds: the
 * WebSocket close frame queues behind data already handed to the socket, so the
 * message is delivered rather than discarded with the connection.
 */
function close(connection: Connection, message: AccessRevokedMessage | SessionEndedMessage): void {
  connection.readOnly = true;
  connection.sendStateless(JSON.stringify(message));
  connection.close();
}

/**
 * Run one pass over every open connection.
 *
 * Exported separately from the scheduler so it can be driven directly in a
 * test, and so a caller can force a pass without waiting for the next tick.
 *
 * Sessions are read once for the whole pass — one indexed query however many
 * connections are open — rather than once per connection. This is what ends
 * an editor within seconds of its session being ended anywhere: a password
 * reset, a sign-out, signing out everywhere, or a stolen refresh token being
 * caught. If that read fails, the pass carries on without it: a database blip
 * must not close anybody's board.
 */
export async function reauthorizeOnce({ server, db, log }: ReauthorizeDeps): Promise<void> {
  const connections = [...server.documents.values()].flatMap((document) =>
    document.getConnections(),
  );
  if (connections.length === 0) return;

  const sessionIds = connections
    .map((connection) => (connection.context as ConnectionContext).sessionId)
    .filter((id): id is string => typeof id === 'string');

  let liveSessions: Set<string> | undefined;
  try {
    liveSessions = await liveSessionIds(db, sessionIds);
  } catch (error) {
    log.warn('session check failed, leaving sessions as-is this pass', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  for (const connection of connections) {
    await reauthorizeConnection(connection, { db, log }, liveSessions);
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
