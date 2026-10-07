import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boards } from '../schema/boards.js';
import { users } from '../schema/users.js';
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
