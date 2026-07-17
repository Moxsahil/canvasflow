import { pgTable, uuid, timestamp, bigint, customType, index } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';
import { users } from './users.js';

/**
 * Custom bytea column type for Yjs binary updates.
 * Yjs.encodeStateAsUpdate returns Uint8Array; we store it in Postgres bytea.
 */
const bytea = customType<{ data: Uint8Array; default: false }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
  fromDriver(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) return value;
    if (Buffer.isBuffer(value)) return new Uint8Array(value);
    throw new Error('Unexpected bytea value type');
  },
});

/**
 * Append-only log of Yjs updates for each board.
 * On board load: fetch all updates, apply in order to reconstruct doc.
 * On any change: append a new update.
 * Compaction (future): periodically fold N updates into one snapshot.
 */
export const boardUpdates = pgTable(
  'board_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    update: bytea('update').notNull(),
    /** Byte length for quick "how big is this update log?" queries. */
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    boardIdIdx: index('board_updates_board_id_idx').on(table.boardId),
    // Composite index for the load query: "get updates for board X in order"
    boardIdCreatedAtIdx: index('board_updates_board_id_created_at_idx').on(
      table.boardId,
      table.createdAt,
    ),
  }),
);

export type BoardUpdateRow = typeof boardUpdates.$inferSelect;
export type NewBoardUpdateRow = typeof boardUpdates.$inferInsert;
