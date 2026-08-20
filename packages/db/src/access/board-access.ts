import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boards } from '../schema/boards.js';
import { memberships } from '../schema/workspaces.js';
import { boardMembers, type BoardRole } from '../schema/board-access.js';

export interface BoardAccess {
  boardId: string;
  workspaceId: string;
  ownerId: string;
  role: BoardRole;
  /**
   * Where the grant came from. Useful for diagnostics and for UI that
   * distinguishes "you're on this board because you're on the team" from
   * "you were explicitly invited".
   */
  source: 'owner' | 'board-member' | 'workspace';
}

/**
 * THE authorization decision for a board. Every service must route
 * through this one function — api-gateway, sync-server, and the web app
 * previously each carried their own near-identical copy, which is exactly
 * how an authorization bug ships to one service and not the others.
 *
 * Resolution order, most specific first:
 *
 *   1. Board missing or soft-deleted        -> no access
 *   2. Caller is boards.ownerId             -> owner (implicit; needs no
 *      membership row, so boards created before board_members existed
 *      keep working with no backfill)
 *   3. Explicit board_members row, active   -> that row's role
 *   4. Explicit board_members row, revoked  -> NO ACCESS, and this
 *      deliberately outranks the workspace fallback below. Revoking
 *      someone has to actually revoke them, even if they'd otherwise
 *      qualify through the workspace.
 *   5. Workspace membership                 -> editor. Preserves the
 *      existing product behaviour that a team shares its boards; without
 *      it, every current user would abruptly lose access to boards they
 *      can reach today.
 *   6. Otherwise                            -> no access
 *
 * Returns null for both "doesn't exist" and "not allowed" — callers must
 * surface 404 for both, never 403, so board existence isn't leaked to
 * someone probing ids.
 */
export async function resolveBoardAccess(
  db: Database,
  userId: string,
  boardId: string,
): Promise<BoardAccess | null> {
  const boardRows = await db
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      ownerId: boards.ownerId,
    })
    .from(boards)
    .where(and(eq(boards.id, boardId), isNull(boards.deletedAt)))
    .limit(1);

  const board = boardRows[0];
  if (!board) return null;

  const base = {
    boardId: board.id,
    workspaceId: board.workspaceId,
    ownerId: board.ownerId,
  };

  if (board.ownerId === userId) {
    return { ...base, role: 'owner', source: 'owner' };
  }

  const memberRows = await db
    .select({ role: boardMembers.role, status: boardMembers.status })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
    .limit(1);

  const member = memberRows[0];
  if (member) {
    // An explicit decision — in either direction — wins over the
    // workspace-wide default.
    if (member.status === 'revoked') return null;
    return { ...base, role: member.role, source: 'board-member' };
  }

  const workspaceRows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, board.workspaceId), eq(memberships.userId, userId)))
    .limit(1);

  if (workspaceRows[0]) {
    return { ...base, role: 'editor', source: 'workspace' };
  }

  return null;
}

/** Roles permitted to mutate document state. Viewers are read-only. */
export function canEdit(role: BoardRole): boolean {
  return role === 'owner' || role === 'editor';
}

/** Roles permitted to manage membership: approve/reject requests, revoke access. */
export function canManageMembers(role: BoardRole): boolean {
  return role === 'owner';
}
