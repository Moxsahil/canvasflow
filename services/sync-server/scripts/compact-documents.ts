import { boardUpdates, createClient } from '@canvasflow/db';
import { shapeToYMap, yMapToShape } from '@canvasflow/canvas-engine';
import { desc, eq, inArray, lt, sql } from 'drizzle-orm';
import * as Y from 'yjs';

/**
 * Shrink stored documents by rebuilding them without their edit history.
 *
 * WHAT IS ACTUALLY BIG
 *
 * A Yjs document remembers everything it has ever contained. Deleting a shape
 * releases its content but leaves behind the structure that identifies it, so
 * that a peer returning after a week can still reconcile against a change it
 * never saw. The cost is that a snapshot grows with how much a board has been
 * *worked on*, not with what is drawn on it. One board here needed 771 KB to
 * describe seventeen shapes; 98.8% of that was the record of erased strokes.
 *
 * Copying the live shapes into a brand new document leaves that behind, because
 * a document that never held those shapes has nothing to remember about them.
 *
 * WHY THIS CANNOT RUN ON A BOARD SOMEONE IS USING
 *
 * A rebuilt document is not a smaller version of the original — it is a
 * different document that happens to look the same. Its shapes carry new
 * internal identities, so Yjs cannot tell that the two describe the same
 * board: merging them yields every shape twice.
 *
 * That makes a live room genuinely dangerous rather than merely wasteful. A
 * sync-server holding the room in memory would keep writing the old document
 * beside the compacted one, and the next read would merge the two into a board
 * with duplicated contents.
 *
 * The guard is the idle window below. Hocuspocus keeps a room in memory only
 * for its store debounce after the last client leaves — tens of seconds — so a
 * board untouched for an hour is held by nobody, and the next person to open
 * it loads what this wrote.
 *
 * Usage:
 *   pnpm --filter @canvasflow/sync-server compact:documents            # dry run
 *   pnpm --filter @canvasflow/sync-server compact:documents --apply
 *   ... --apply --idle-minutes=180    # be stricter about what counts as idle
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Run with --env-file=.env');
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const IDLE_MINUTES = Number(args.find((a) => a.startsWith('--idle-minutes='))?.split('=')[1] ?? 60);

/**
 * Leave a document alone unless the rebuild is a real improvement.
 *
 * Rewriting every board on every run would churn storage and hand each one a
 * new identity for no reason. A board that is already mostly live content has
 * nothing here to reclaim.
 */
const MIN_GAIN = 0.2;

const db = createClient(connectionString);
const kb = (n: number) => `${(n / 1024).toFixed(0)} kB`;

/** Copy the live shapes into a new document, leaving the history behind. */
function rebuild(source: Y.Doc): { update: Uint8Array; shapes: number; dropped: number } {
  const fresh = new Y.Doc();
  const target = fresh.getArray<Y.Map<unknown>>('shapes');

  let dropped = 0;
  fresh.transact(() => {
    for (const entry of source.getArray<Y.Map<unknown>>('shapes').toArray()) {
      // Round-trip through the same conversion the editor uses, rather than
      // copying keys by hand. It is the one place that knows which fields a
      // kind of shape has, and it already repairs the values found in the wild
      // that are not the type the schema promises.
      const shape = yMapToShape(entry);
      if (!shape) {
        // Unreadable to the editor, so it was never going to render. Compaction
        // is the honest moment to let it go, but not silently.
        dropped += 1;
        continue;
      }
      target.push([shapeToYMap(shape)]);
    }
  });

  return { update: Y.encodeStateAsUpdate(fresh), shapes: target.length, dropped };
}

async function main(): Promise<void> {
  const cutoff = new Date(Date.now() - IDLE_MINUTES * 60_000);

  const candidates = await db
    .select({
      boardId: boardUpdates.boardId,
      newest: sql<Date>`max(${boardUpdates.createdAt})`.as('newest'),
      rows: sql<number>`count(*)::int`.as('rows'),
      bytes: sql<number>`sum(${boardUpdates.sizeBytes})::bigint`.as('bytes'),
    })
    .from(boardUpdates)
    .groupBy(boardUpdates.boardId)
    .having(lt(sql`max(${boardUpdates.createdAt})`, cutoff));

  console.log(
    `${APPLY ? 'COMPACTING' : 'DRY RUN'} — ${candidates.length} board(s) idle for ${IDLE_MINUTES}m\n`,
  );

  let before = 0;
  let after = 0;
  let changed = 0;

  for (const board of candidates) {
    const rows = await db
      .select({ id: boardUpdates.id, update: boardUpdates.update, author: boardUpdates.authorId })
      .from(boardUpdates)
      .where(eq(boardUpdates.boardId, board.boardId))
      .orderBy(desc(boardUpdates.createdAt));

    if (rows.length === 0) continue;

    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.mergeUpdates(rows.map((r) => new Uint8Array(r.update))));

    const original = Y.encodeStateAsUpdate(doc).length;
    const { update, shapes, dropped } = rebuild(doc);
    const gain = 1 - update.length / original;

    if (gain < MIN_GAIN) {
      console.log(`  skip  ${board.boardId}  ${kb(original)}, ${shapes} shapes — already compact`);
      continue;
    }

    console.log(
      `  ${APPLY ? 'compact' : 'would'}  ${board.boardId}  ` +
        `${kb(original)} -> ${kb(update.length)}  (${(original / update.length).toFixed(1)}x, ` +
        `${shapes} shapes${dropped ? `, ${dropped} unreadable dropped` : ''})`,
    );

    before += original;
    after += update.length;
    changed += 1;

    if (!APPLY) continue;

    await db.transaction(async (tx) => {
      await tx.insert(boardUpdates).values({
        boardId: board.boardId,
        // Attributed to whoever last saved the board. Compaction has no author
        // of its own, and the column is a real foreign key — borrowing the last
        // writer is truer than inventing a system user that never drew anything.
        authorId: rows[0]!.author,
        update,
        sizeBytes: update.length,
      });

      // Delete exactly the rows this run read, by id. Anything written in the
      // meantime is not in that set and survives — which matters because such a
      // row can only have come from a server that reopened the room, and its
      // document is the one still being edited.
      await tx.delete(boardUpdates).where(
        inArray(
          boardUpdates.id,
          rows.map((r) => r.id),
        ),
      );
    });
  }

  console.log(
    `\n${changed} board(s) ${APPLY ? 'compacted' : 'would be compacted'}: ` +
      `${kb(before)} -> ${kb(after)}` +
      (before ? `  (${(before / (after || 1)).toFixed(1)}x smaller)` : ''),
  );

  if (!APPLY && changed > 0) console.log('\nRe-run with --apply to write these changes.');
}

await main();
process.exit(0);
