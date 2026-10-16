import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boards } from '../schema/boards.js';
import { users } from '../schema/users.js';
import { boardPins } from '../schema/board-pins.js';
import { toBoardSummary, type BoardSummary } from './workspaces.js';

/**
 * Edits to a board's own record, as opposed to its document or its membership.
 *
 * Authorization is deliberately *not* here: callers resolve access through
 * `resolveBoardAccess` first and decide what the role allows, the way the
 * membership routes already do. Keeping the mutation itself unguarded means
 * there is one place that knows the rule, rather than a second copy of it
 * growing quietly inside a writer.
 */

export interface BoardDetailsPatch {
  /** Already trimmed by the caller; an empty string is rejected, not defaulted. */
  title?: string;
  color?: BoardSummary['color'];
}

/**
 * Rename a board and/or set its tag colour.
 *
 * Returns null for a board that doesn't exist or is soft-deleted, and for an
 * empty patch — there is nothing to write, and reporting success for a request
 * that changed nothing would hide a client bug.
 *
 * `updatedAt` moves with the edit. The board switcher orders by it, so a board
 * someone has just named rises to the top of the list where they left it.
 */
export async function updateBoardDetails(
  db: Database,
  boardId: string,
  patch: BoardDetailsPatch,
): Promise<BoardSummary | null> {
  const values: { title?: string; color?: BoardSummary['color']; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.color !== undefined) values.color = patch.color;

  if (values.title === undefined && values.color === undefined) return null;

  const [board] = await db
    .update(boards)
    .set(values)
    .where(and(eq(boards.id, boardId), isNull(boards.deletedAt)))
    .returning();

  return board ? toBoardSummary(board) : null;
}

/**
 * Delete a board, softly.
 *
 * The row and its update log stay put — every read path already filters on
 * `deletedAt`, so a tombstoned board disappears from the switcher, stops
 * resolving through `resolveBoardAccess`, and drops anyone who has it open at
 * the sync-server's next re-authorization sweep. Nothing is actually
 * destroyed, which is what makes this recoverable by an operator.
 *
 * Returns null for a board that doesn't exist or was already deleted, so a
 * double-submit answers "not found" rather than a second success.
 */
export async function softDeleteBoard(db: Database, boardId: string): Promise<BoardSummary | null> {
  const [board] = await db
    .update(boards)
    .set({ deletedAt: new Date() })
    .where(and(eq(boards.id, boardId), isNull(boards.deletedAt)))
    .returning();

  return board ? toBoardSummary(board) : null;
}

/**
 * Archive a board, or bring it back.
 *
 * Nothing is removed: the board leaves the lists and turns read-only for
 * everyone — `resolveBoardAccess` reports it, and `canEdit` refuses — until
 * it is unarchived. `updatedAt` stays where it was, since nothing in the board
 * changed; it goes back into the list where it used to sit.
 *
 * Null for a board that doesn't exist, is deleted, or is already in the state
 * asked for, so a double-submit answers "not found" rather than a second
 * success.
 */
export async function setBoardArchived(
  db: Database,
  boardId: string,
  archived: boolean,
): Promise<BoardSummary | null> {
  const [board] = await db
    .update(boards)
    .set({ archivedAt: archived ? new Date() : null })
    .where(
      and(
        eq(boards.id, boardId),
        isNull(boards.deletedAt),
        archived ? isNull(boards.archivedAt) : isNotNull(boards.archivedAt),
      ),
    )
    .returning();

  return board ? toBoardSummary(board) : null;
}

/**
 * Pin a board to the top of one person's sidebar, or move their pin.
 *
 * One statement either way: the (user, board) key makes a second pin a move.
 * Whether they may see the board at all is decided before this, as for every
 * writer here.
 */
export async function pinBoard(
  db: Database,
  userId: string,
  boardId: string,
  position: string,
): Promise<void> {
  await db
    .insert(boardPins)
    .values({ userId, boardId, position })
    .onConflictDoUpdate({ target: [boardPins.userId, boardPins.boardId], set: { position } });
}

/** Take a board off one person's pins. False when it was not pinned. */
export async function unpinBoard(db: Database, userId: string, boardId: string): Promise<boolean> {
  const removed = await db
    .delete(boardPins)
    .where(and(eq(boardPins.userId, userId), eq(boardPins.boardId, boardId)))
    .returning({ boardId: boardPins.boardId });
  return removed.length > 0;
}

/** What anyone on a board may know about it, whoever they are. */
export interface BoardOverview {
  title: string;
  color: BoardSummary['color'];
  ownerId: string;
  ownerName: string;
}

/**
 * A board's name, tag colour and owner, for people who can open it but are not
 * in its workspace — someone let in by a share link has no board list to read
 * these from, and saw the board's id where its name belongs.
 *
 * Null for a board that doesn't exist or is soft-deleted. Whether the caller
 * may see it at all is decided before this, as everywhere else here.
 */
export async function boardOverview(db: Database, boardId: string): Promise<BoardOverview | null> {
  const [row] = await db
    .select({
      title: boards.title,
      color: boards.color,
      ownerId: boards.ownerId,
      ownerName: users.name,
    })
    .from(boards)
    .innerJoin(users, eq(users.id, boards.ownerId))
    .where(and(eq(boards.id, boardId), isNull(boards.deletedAt)))
    .limit(1);

  return row ?? null;
}
