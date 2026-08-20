import { resolveBoardAccess, type BoardAccess, type Database } from '@canvasflow/db';

export type { BoardAccess };

/**
 * Re-verify at connect time that a user still has access to a board.
 *
 * Performance-critical: this runs on every WebSocket handshake. The rule
 * itself lives in @canvasflow/db (`resolveBoardAccess`) so this service, the
 * api-gateway and the web app all reach the same verdict — previously each
 * carried its own copy of the join, which is how an authorization fix ships to
 * one service and silently misses the other two.
 *
 * Returns null for both "no such board" and "access revoked"; the caller
 * rejects the connection either way without saying which.
 */
export async function checkBoardAccess(
  db: Database,
  userId: string,
  boardId: string,
): Promise<BoardAccess | null> {
  return resolveBoardAccess(db, userId, boardId);
}
