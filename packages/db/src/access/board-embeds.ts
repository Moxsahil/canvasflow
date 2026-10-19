import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boardEmbeds } from '../schema/board-embeds.js';
import { boardUpdates } from '../schema/board-updates.js';
import { boards } from '../schema/boards.js';
import { BOARD_SNAPSHOT_WINDOW } from './board-export.js';

/**
 * Boards shown on other sites: Share → Embed on a website.
 *
 * Who may turn it on is the caller's to decide — the gateway holds it to
 * whoever runs the board's sharing. Everything here past that is read by
 * anyone who has the embed code, so it answers only for boards that are still
 * there: one in the trash, or gone, is an embed that has stopped.
 */

/** The board's embed id while embedding is on; null while it is off. */
export async function boardEmbedId(db: Database, boardId: string): Promise<string | null> {
  const [row] = await db
    .select({ publicId: boardEmbeds.publicId })
    .from(boardEmbeds)
    .where(eq(boardEmbeds.boardId, boardId))
    .limit(1);
  return row?.publicId ?? null;
}

/**
 * Turn embedding on, under `publicId` — or, when it is on already, leave it as
 * it is and answer with the id it has, so the code someone already pasted
 * somewhere keeps working.
 */
export async function enableBoardEmbed(
  db: Database,
  boardId: string,
  publicId: string,
): Promise<string> {
  await db.insert(boardEmbeds).values({ boardId, publicId }).onConflictDoNothing({
    target: boardEmbeds.boardId,
  });
  const id = await boardEmbedId(db, boardId);
  // Only a board deleted in between leaves no row, and the board's foreign key
  // would have refused the insert first.
  if (!id) throw new Error(`Board ${boardId} has no embed after enabling it`);
  return id;
}

/** Turn embedding off: every copy of the code stops at once. */
export async function disableBoardEmbed(db: Database, boardId: string): Promise<void> {
  await db.delete(boardEmbeds).where(eq(boardEmbeds.boardId, boardId));
}

export interface EmbeddedBoard {
  boardId: string;
  title: string;
}

/** The board an embed id shows, or null when there is none to show. */
export async function embeddedBoard(db: Database, publicId: string): Promise<EmbeddedBoard | null> {
  const [row] = await db
    .select({ boardId: boards.id, title: boards.title })
    .from(boardEmbeds)
    .innerJoin(boards, eq(boards.id, boardEmbeds.boardId))
    .where(and(eq(boardEmbeds.publicId, publicId), isNull(boards.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Which save of the board is the newest: its id, or null for a board never
 * drawn on. A cheap question, asked before the saves themselves, so a board
 * nobody has changed since it was last read is not read again.
 */
export async function latestBoardSnapshotId(db: Database, boardId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: boardUpdates.id })
    .from(boardUpdates)
    .where(eq(boardUpdates.boardId, boardId))
    .orderBy(desc(boardUpdates.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/** The board's saves, newest first: the same window the sync-server loads. */
export async function boardSnapshots(db: Database, boardId: string): Promise<Uint8Array[]> {
  const rows = await db
    .select({ update: boardUpdates.update })
    .from(boardUpdates)
    .where(eq(boardUpdates.boardId, boardId))
    .orderBy(desc(boardUpdates.createdAt))
    .limit(BOARD_SNAPSHOT_WINDOW);
  return rows.map((row) => row.update);
}
