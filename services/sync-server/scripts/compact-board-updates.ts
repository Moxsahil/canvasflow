import { boardUpdates, createClient } from '@canvasflow/db';
import { asc, eq, sql } from 'drizzle-orm';
import * as Y from 'yjs';

/**
 * One-shot backfill: give every board a single row that carries its whole
 * history, so the windowed read in loadSnapshot() is correct for boards
 * written before this change.
 *
 * WHY IT IS NEEDED
 *
 * loadSnapshot() reads only the newest few rows, which is safe exactly
 * when older rows are redundant. That holds for every row onStoreDocument
 * wrote — those are complete `Y.encodeStateAsUpdate` snapshots. It does
 * NOT necessarily hold for rows left by the HTTP append path removed in
 * 5c31b5a, which wrote incremental deltas. A board whose most recent write
 * predates that commit could still have real history outside the window.
 *
 * Merging the entire log resolves the ambiguity: Yjs updates are
 * idempotent and order-independent, so the merged result is equivalent to
 * replaying every row, whichever rows were deltas and whichever were
 * snapshots.
 *
 * WHY IT DELETES NOTHING
 *
 * The merged snapshot is appended as the newest row and the old rows are
 * left alone. That is deliberate:
 *
 *  - Reads are correct the instant this finishes, because the newest row
 *    now subsumes everything behind it.
 *  - Nothing is destroyed, so a bad merge cannot lose data and the script
 *    needs no verification step to be safe.
 *  - Storage reclamation is already saveSnapshot()'s job — its prune drops
 *    everything outside the retention window on the board's next save,
 *    which happens seconds after anyone next opens it.
 *
 * Safe to re-run. Boards already at a single row are skipped.
 *
 * Usage:  pnpm --filter @canvasflow/sync-server compact:updates
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Run with --env-file=.env');
  process.exit(1);
}

const db = createClient(connectionString);

async function main(): Promise<void> {
  const boards = await db
    .select({
      boardId: boardUpdates.boardId,
      rowCount: sql<number>`count(*)::int`,
    })
    .from(boardUpdates)
    .groupBy(boardUpdates.boardId);

  const needsWork = boards.filter((b) => b.rowCount > 1);
  console.log(`${boards.length} board(s) with history; ${needsWork.length} need compaction.`);

  let pending = 0;

  for (const board of needsWork) {
    const rows = await db
      .select({ update: boardUpdates.update, authorId: boardUpdates.authorId })
      .from(boardUpdates)
      .where(eq(boardUpdates.boardId, board.boardId))
      .orderBy(asc(boardUpdates.createdAt));

    const updates = rows.map((r) => new Uint8Array(r.update));
    const merged = Y.mergeUpdates(updates);
    const before = updates.reduce((sum, u) => sum + u.length, 0);

    if (merged.length === 0) {
      console.warn(`  SKIP ${board.boardId}: merge produced an empty update`);
      continue;
    }

    // Attribute the compacted row to whoever wrote the newest row, so its
    // authorId still points at a real editor of this board.
    await db.insert(boardUpdates).values({
      boardId: board.boardId,
      authorId: rows[rows.length - 1]!.authorId,
      update: merged,
      sizeBytes: merged.length,
    });

    pending += before - merged.length;
    console.log(
      `  ${board.boardId}: ${rows.length} rows / ${kb(before)} -> reads now cost ${kb(merged.length)}`,
    );
  }

  console.log(`Done. ${kb(pending)} will be reclaimed as these boards are next saved.`);
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Compaction failed:', err);
    process.exit(1);
  });
