import { canEdit, resolveBoardAccess, type BoardRole, type Database } from '@canvasflow/db';
import type { Hocuspocus } from '@hocuspocus/server';
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

/**
 * Run one pass over every open connection.
 *
 * Exported separately from the scheduler so it can be driven directly in a
 * test, and so a caller can force a pass without waiting for the next tick.
 */
export async function reauthorizeOnce({ server, db, log }: ReauthorizeDeps): Promise<void> {
  for (const document of server.documents.values()) {
    for (const connection of document.getConnections()) {
      const context = connection.context as ConnectionContext;
      const { userId, boardId } = context;

      // Connections that never authenticated carry no context; Hocuspocus can
      // hand those to hooks before onAuthenticate has resolved.
      if (!userId || !boardId) continue;

      try {
        const access = await resolveBoardAccess(db, userId, boardId);

        if (!access) {
          log.info('access revoked, closing connection', { userId, boardId });
          connection.close();
          continue;
        }

        const shouldBeReadOnly = !canEdit(access.role);
        const wasReadOnly = Boolean(connection.readOnly);

        if (shouldBeReadOnly === wasReadOnly && context.role === access.role) continue;

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
      } catch (error) {
        // A database blip must not close anyone's board. Skip this connection
        // and re-check it on the next pass.
        log.warn('re-authorization check failed, leaving connection as-is', {
          userId,
          boardId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
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
