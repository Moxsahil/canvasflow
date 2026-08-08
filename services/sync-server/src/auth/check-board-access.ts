import { boards, memberships, type Database } from '@canvasflow/db';
import { and, eq, isNull } from 'drizzle-orm';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface BoardAccessResult {
  boardId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

/**
 * Re-verify at connect time that a user still has access to a board.
 *
 * Performance-critical path: this runs on every WebSocket handshake, and
 * PR #29 will call it periodically on active connections. We use a single
 * JOIN rather than two sequential round trips — joining the user's
 * memberships to the board via workspaceId filters in one round trip.
 *
 * The (workspace_id, user_id) unique constraint on memberships guarantees
 * at most one matching row, so limit(1) is deterministic.
 *
 * DUPLICATED FROM:
 *   - apps/web/src/lib/boards/access.ts
 *   - services/api-gateway/src/boards/boards.service.ts (findByIdForUser)
 *
 * TODO: Extract to a shared package (@canvasflow/board-access) once
 * we have three services depending on this logic. For now, three copies
 * with matching semantics is simpler than the extraction work.
 *
 * ANY CHANGE HERE MUST BE MIRRORED TO THE OTHER TWO.
 */
export async function checkBoardAccess(
  db: Database,
  userId: string,
  boardId: string,
): Promise<BoardAccessResult | null> {
  const rows = await db
    .select({
      workspaceId: boards.workspaceId,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(boards, eq(boards.workspaceId, memberships.workspaceId))
    .where(and(eq(memberships.userId, userId), eq(boards.id, boardId), isNull(boards.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    boardId,
    workspaceId: row.workspaceId,
    role: row.role,
  };
}
