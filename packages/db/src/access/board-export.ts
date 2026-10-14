import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boards } from '../schema/boards.js';
import { boardUpdates } from '../schema/board-updates.js';

/**
 * Taking your boards with you: Settings → Data & Privacy → Export all boards.
 *
 * Only boards the account owns, in every workspace, and none in the trash —
 * the same boards Storage used counts and Delete account takes. A board
 * somebody else shared is theirs to export.
 */

/**
 * How many recent snapshots make up a board. Kept equal to the sync-server's
 * `SNAPSHOT_RETENTION` (persistence/board-updates-store.ts), which merges the
 * same window when it loads a board: each row is a whole document, and
 * merging the few newest recovers anything a newest-only read would drop.
 */
export const BOARD_SNAPSHOT_WINDOW = 3;

export interface ExportableBoard {
  id: string;
  title: string;
  updatedAt: Date;
}

/** The boards to export, most recently changed first. */
export async function exportableBoards(db: Database, userId: string): Promise<ExportableBoard[]> {
  return db
    .select({ id: boards.id, title: boards.title, updatedAt: boards.updatedAt })
    .from(boards)
    .where(and(eq(boards.ownerId, userId), isNull(boards.deletedAt)))
    .orderBy(desc(boards.updatedAt));
}

/**
 * The saved snapshots of one board, newest first — or null when the board is
 * not one this account may export. An empty list is a board that was never
 * drawn on.
 */
export async function exportableBoardSnapshots(
  db: Database,
  userId: string,
  boardId: string,
): Promise<Uint8Array[] | null> {
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, userId), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return null;

  const rows = await db
    .select({ update: boardUpdates.update })
    .from(boardUpdates)
    .where(eq(boardUpdates.boardId, boardId))
    .orderBy(desc(boardUpdates.createdAt))
    .limit(BOARD_SNAPSHOT_WINDOW);
  return rows.map((row) => row.update);
}
