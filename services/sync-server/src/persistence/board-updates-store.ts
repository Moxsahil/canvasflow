import { boardUpdates, type Database } from '@canvasflow/db';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import * as Y from 'yjs';

/**
 * Sync-server's persistence layer for Yjs board state.
 *
 * Every row in `board_updates` is a COMPLETE document snapshot produced by
 * `Y.encodeStateAsUpdate` — not an incremental delta. That has always been
 * true of what onStoreDocument writes; the table name is a leftover from
 * when an HTTP path appended real deltas (removed in 5c31b5a).
 *
 * Because each row is complete, every older row is redundant the moment a
 * newer one lands. We used to keep them all and replay the whole log on
 * load, which made storage grow quadratically: one board accumulated 74
 * rows totalling 3.83 MB to represent an 8.4 KB document — a 458x
 * amplification, and a measured 45-second read. So the write path prunes.
 *
 * Notably, we do NOT re-verify workspace membership on each read/write:
 * - Connection was authorized in onAuthenticate (see src/index.ts)
 * - Periodic reauth (PR #29) closes the revocation window
 */

/**
 * The largest snapshot we will write.
 *
 * This is a guard against a runaway document, not a size the product should
 * ever approach: a board's snapshot is dominated by how much has been *edited*,
 * not by what is currently drawn on it, because a Yjs document keeps the
 * structure of everything ever deleted. One board here reached 771 KB to
 * describe seventeen shapes — 98.8% of it the record of erased work.
 *
 * Raised from 1 MB, which that board was within a few sessions of crossing.
 * Hitting this ceiling does not fail loudly to the person drawing: their board
 * keeps working from memory and quietly stops being saved. So the number needs
 * enough headroom that compaction, not the cap, is what keeps documents small.
 */
const MAX_UPDATE_BYTES = 5_000_000;

/**
 * How many recent snapshots to keep per board.
 *
 * One row is enough to reconstruct the document. We keep a few because:
 *
 *  1. Recovery. Compaction deletes data. If a write ever lands truncated
 *     or corrupt, retaining only the newest row means we just destroyed
 *     the last good copy, with no way back.
 *  2. Concurrent writers. If two sync-server instances ever hold the same
 *     room, neither one's snapshot subsumes the other's. Merging the
 *     window on read recovers both instead of silently dropping whichever
 *     landed first.
 *
 * Three rows of an 8 KB document is ~25 KB — nothing next to the 3.83 MB
 * it replaces, and it buys a fallback that a single row cannot.
 */
const SNAPSHOT_RETENTION = 3;

export class UpdateTooLargeError extends Error {
  constructor(size: number) {
    super(`Update too large (${size} bytes, max ${MAX_UPDATE_BYTES})`);
    this.name = 'UpdateTooLargeError';
  }
}

export class EmptyUpdateError extends Error {
  constructor() {
    super('Empty update rejected');
    this.name = 'EmptyUpdateError';
  }
}

/**
 * Load a board's persisted state as one update ready for Y.applyUpdate.
 *
 * Reads the retention window instead of the whole table, then merges it.
 * Merging is idempotent and commutative in Yjs, so folding N complete
 * snapshots costs about a millisecond and can never produce a worse result
 * than taking the newest alone — it only recovers writes that a
 * newest-wins read would have dropped.
 *
 * PRECONDITION: rows outside the retention window must already be
 * redundant. That holds for anything this module wrote, and for legacy
 * boards once scripts/compact-board-updates.ts has run. Run that script
 * before deploying this read path — boards last written by the removed
 * HTTP delta path could otherwise have history older than the window.
 *
 * Returns null for a board with no history yet. Not an error.
 */
export async function loadSnapshot(db: Database, boardId: string): Promise<Uint8Array | null> {
  const rows = await db
    .select({ update: boardUpdates.update })
    .from(boardUpdates)
    .where(eq(boardUpdates.boardId, boardId))
    .orderBy(desc(boardUpdates.createdAt))
    .limit(SNAPSHOT_RETENTION);

  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!.update;

  return Y.mergeUpdates(rows.map((r) => new Uint8Array(r.update)));
}

/**
 * Persist the current document state, replacing what came before.
 *
 * Insert-then-prune runs in one transaction so a board is never left
 * without a readable snapshot: the new row is committed before the old
 * ones go, and a rollback leaves the previous state fully intact.
 *
 * The prune deletes everything outside this board's newest
 * SNAPSHOT_RETENTION rows, which means bloated boards heal themselves on
 * their first save — the backfill script only makes that eager.
 */
export async function saveSnapshot(
  db: Database,
  boardId: string,
  authorId: string,
  state: Uint8Array,
): Promise<void> {
  if (state.length === 0) {
    throw new EmptyUpdateError();
  }
  if (state.length > MAX_UPDATE_BYTES) {
    throw new UpdateTooLargeError(state.length);
  }

  await db.transaction(async (tx) => {
    await tx.insert(boardUpdates).values({
      boardId,
      authorId,
      update: state,
      sizeBytes: state.length,
    });

    // Subquery rather than two round trips: Postgres evaluates the
    // "newest N ids" set as part of the DELETE, so the prune stays one
    // statement and cannot race against its own read.
    const keep = tx
      .select({ id: boardUpdates.id })
      .from(boardUpdates)
      .where(eq(boardUpdates.boardId, boardId))
      .orderBy(desc(boardUpdates.createdAt))
      .limit(SNAPSHOT_RETENTION);

    await tx
      .delete(boardUpdates)
      .where(and(eq(boardUpdates.boardId, boardId), notInArray(boardUpdates.id, keep)));
  });
}
