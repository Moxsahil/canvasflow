import { pgTable, uuid, text, timestamp, bigint, index, primaryKey } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';
import { users } from './users.js';

/**
 * A record of the images placed on a board — metadata only.
 *
 * The pixels live in object storage, keyed `boards/{board_id}/{file_id}`, and
 * reach the browser directly over a signed URL. They were briefly kept here in
 * a `bytea` column, which worked but put every image view through the
 * database's data-transfer budget; a whiteboard is read-heavy by nature, so
 * that is the one cost that grows without bound.
 *
 * What stays is what the object store cannot cheaply answer: which images a
 * board has, how big they are, and who added them. The row is written when an
 * upload is authorized rather than after it completes, so a row may briefly
 * describe an object that does not exist yet. That is deliberate — whether the
 * bytes have landed is already tracked on the shape itself, which is where
 * collaborators look before fetching.
 *
 * `file_id` is a content hash of the original upload, which makes the primary
 * key do real work: the same picture dropped on a board five times is one row
 * and one object, and a re-upload after a failure overwrites itself rather
 * than duplicating.
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
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** Who first uploaded it. Kept for auditing, not for access control. */
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Composite key rather than a surrogate id: it is what makes a repeated
    // upload of the same bytes an upsert instead of a second copy, and it is
    // the object's storage key with a slash between the halves.
    pk: primaryKey({ columns: [table.boardId, table.fileId] }),
    boardIdIdx: index('board_images_board_id_idx').on(table.boardId),
  }),
);

export type BoardImageRow = typeof boardImages.$inferSelect;
export type NewBoardImageRow = typeof boardImages.$inferInsert;
