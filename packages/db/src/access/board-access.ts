import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boards } from '../schema/boards.js';
import { memberships, type MembershipRow } from '../schema/workspaces.js';
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
  /**
   * The caller's role in the board's workspace, or null outside it. Read in
   * the same query, so a route that also asks "may they administer it" — a
   * delete, say — needs no second lookup.
   */
  workspaceRole: MembershipRow['role'] | null;
  /**
   * Archived boards are read-only for everyone, owner included, until they
   * are unarchived. `role` still says what the caller would be — it is what
   * decides who may unarchive or share — so whether they may write is
   * `canEdit(access)`, never the role alone.
   */
  archived: boolean;
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
  // One round trip: the caller's board_members row and workspace membership
  // are both unique per (board or workspace, user), so the left joins add at
  // most one row each and the rules below read the answer in order.
  const rows = await db
    .select({
      workspaceId: boards.workspaceId,
      ownerId: boards.ownerId,
      memberRole: boardMembers.role,
      memberStatus: boardMembers.status,
      workspaceRole: memberships.role,
      archivedAt: boards.archivedAt,
    })
    .from(boards)
    .leftJoin(
      boardMembers,
      and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, userId)),
    )
    .leftJoin(
      memberships,
      and(eq(memberships.workspaceId, boards.workspaceId), eq(memberships.userId, userId)),
    )
    .where(and(eq(boards.id, boardId), isNull(boards.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const base = {
    boardId,
    workspaceId: row.workspaceId,
    ownerId: row.ownerId,
    workspaceRole: row.workspaceRole,
    archived: row.archivedAt !== null,
  };

  if (row.ownerId === userId) {
    return { ...base, role: 'owner', source: 'owner' };
  }

  if (row.memberRole !== null) {
    // An explicit decision — in either direction — wins over the
    // workspace-wide default.
    if (row.memberStatus === 'revoked') return null;
    return { ...base, role: row.memberRole, source: 'board-member' };
  }

  if (row.workspaceRole !== null) {
    return { ...base, role: 'editor', source: 'workspace' };
  }

  return null;
}

/**
 * Whether this access may change the board: its document, its name, its
 * pictures. Viewers never may, and nobody may while the board is archived.
 *
 * Takes the whole access rather than the role so a caller cannot forget the
 * archive: a role on its own no longer answers this.
 */
export function canEdit(access: Pick<BoardAccess, 'role' | 'archived'>): boolean {
  return !access.archived && (access.role === 'owner' || access.role === 'editor');
}

/**
 * Whether this access may archive the board, unarchive it, or delete it: the
 * board's owner, or an owner or admin of its workspace. Every workspace member
 * may edit its boards, which is fine for a title and far too loose for taking
 * someone's work out of everyone's list.
 */
export function canManageBoard(access: Pick<BoardAccess, 'role' | 'workspaceRole'>): boolean {
  return (
    access.role === 'owner' || access.workspaceRole === 'owner' || access.workspaceRole === 'admin'
  );
}

/** Roles permitted to manage membership: approve/reject requests, revoke access. */
export function canManageMembers(role: BoardRole): boolean {
  return role === 'owner';
}
