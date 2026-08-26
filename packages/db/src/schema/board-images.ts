import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  customType,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { boards } from './boards.js';
import { users } from './users.js';

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
 * Bytes for the images placed on a board.
 *
 * These live here rather than in the Yjs document for one hard reason: every
 * row of `board_updates` is a complete snapshot of the whole document, capped
 * at a megabyte. A single photo encoded into the document would push a board
 * past that cap and stop it saving at all. So the document carries only a
 * `fileId` and the pixels are fetched separately, which keeps a board's
 * snapshot sized by how much was drawn rather than how much was uploaded.
 *
 * `file_id` is a content hash of the original upload, which makes the primary
 * key do real work: the same picture dropped on a board five times is one row,
 * a re-upload after a failure is idempotent rather than a duplicate, and the
 * bytes behind an id can never change — so responses are safely immutable.
 *
 * Scoped per board rather than globally. Two boards holding the same image
 * store it twice, which is the price of never letting a `fileId` guessed from
 * one board read bytes out of another.
 */
export const boardImages = pgTable(
  'board_images',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    /** Lowercase hex SHA-256 of the uploaded bytes. */
    fileId: text('file_id').notNull(),
    mimeType: text('mime_type').notNull(),
    bytes: bytea('bytes').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** Who first uploaded it. Kept for auditing, not for access control. */
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Composite key rather than a surrogate id: it is what makes a repeated
    // upload of the same bytes an upsert instead of a second copy.
    pk: primaryKey({ columns: [table.boardId, table.fileId] }),
    boardIdIdx: index('board_images_board_id_idx').on(table.boardId),
  }),
);

export type BoardImageRow = typeof boardImages.$inferSelect;
export type NewBoardImageRow = typeof boardImages.$inferInsert;
