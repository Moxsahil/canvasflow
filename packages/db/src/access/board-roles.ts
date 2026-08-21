import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boards } from '../schema/boards.js';
import { users } from '../schema/users.js';
import { boardMembers, type BoardRole } from '../schema/board-access.js';

/**
 * Changing who may do what on a board, after they are already on it.
 *
 * Share links decide a role once, at the moment someone joins. That is not
 * enough on its own: the common case is inviting a colleague to edit and later
 * wanting them read-only, or the reverse — and issuing a fresh link does not
 * change what an existing member already holds, because their access lives in
 * `board_members`, not in the link.
 *
 * Every change here takes effect on live connections within one sweep of the
 * sync-server's re-authorization pass, not at the next reconnect.
 */

/** A role a board member can be moved to. Owner is granted by creation only. */
export type AssignableBoardRole = Extract<BoardRole, 'editor' | 'viewer'>;

export interface BoardMemberSummary {
  userId: string;
  name: string;
  email: string;
  isGuest: boolean;
  role: BoardRole;
  status: 'active' | 'revoked';
  /** True for the board's owner, who has no membership row and cannot be changed. */
  isOwner: boolean;
}

/**
 * Everyone with access to this board, owner included.
 *
 * The owner is synthesised rather than read from `board_members`: ownership is
 * implied by `boards.ownerId` and deliberately needs no membership row, so
 * boards that predate the table keep working. Listing them anyway means the UI
 * can show the full picture instead of a list that mysteriously omits one
 * person.
 */
export async function listBoardAccess(
  db: Database,
  boardId: string,
): Promise<BoardMemberSummary[]> {
  const boardRows = await db
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);

  const board = boardRows[0];
  if (!board) return [];

  const ownerRows = await db
    .select({ id: users.id, name: users.name, email: users.email, isGuest: users.isGuest })
    .from(users)
    .where(eq(users.id, board.ownerId))
    .limit(1);

  const memberRows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      isGuest: users.isGuest,
      role: boardMembers.role,
      status: boardMembers.status,
    })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(eq(boardMembers.boardId, boardId));

  const result: BoardMemberSummary[] = [];

  const owner = ownerRows[0];
  if (owner) {
    result.push({
      userId: owner.id,
      name: owner.name,
      email: owner.email,
      isGuest: owner.isGuest,
      role: 'owner',
      status: 'active',
      isOwner: true,
    });
  }

  for (const row of memberRows) {
    // A membership row for the owner is redundant and could otherwise show
    // them twice, at two different roles.
    if (row.userId === board.ownerId) continue;
    result.push({ ...row, isOwner: false });
  }

  return result;
}

export type RoleChangeOutcome =
  | { ok: true; role: AssignableBoardRole }
  | { ok: false; reason: 'board-not-found' | 'cannot-change-owner' | 'not-a-member' };

/**
 * Move an existing member between editor and viewer.
 *
 * Refuses to touch the board's owner: ownership is not a membership row, and
 * demoting the owner would orphan the board with no way back.
 *
 * Only applies to someone who already has a membership row. Using this to
 * *create* access would bypass the share-link flow that records how somebody
 * got here in the first place.
 */
export async function setBoardMemberRole(
  db: Database,
  boardId: string,
  userId: string,
  role: AssignableBoardRole,
): Promise<RoleChangeOutcome> {
  const boardRows = await db
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);

  const board = boardRows[0];
  if (!board) return { ok: false, reason: 'board-not-found' };
  if (board.ownerId === userId) return { ok: false, reason: 'cannot-change-owner' };

  const updated = await db
    .update(boardMembers)
    .set({ role, status: 'active', updatedAt: new Date() })
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
    .returning({ id: boardMembers.id });

  if (updated.length === 0) return { ok: false, reason: 'not-a-member' };
  return { ok: true, role };
}
