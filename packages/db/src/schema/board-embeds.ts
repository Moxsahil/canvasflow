import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';

/**
 * Boards their owner has let other sites show: Share → Embed on a website.
 *
 * One row per board while embedding is on, and none while it is off. The
 * public id is what the embed code carries; it is random, so it says nothing
 * about the board, and it is kept as it is rather than hashed, because the
 * owner has to be able to copy the same code again later. It is not a key to
 * the board — it opens a read-only picture of the board's shapes, without its
 * comments or its people, and nothing else.
 *
 * Turning embedding off deletes the row, which stops every copy of the code at
 * once; turning it on again makes a new id, so an old copy stays stopped.
 */
export const boardEmbeds = pgTable('board_embeds', {
  boardId: uuid('board_id')
    .primaryKey()
    .references(() => boards.id, { onDelete: 'cascade' }),
  /** 22 characters of URL-safe base64: 128 random bits. */
  publicId: text('public_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BoardEmbedRow = typeof boardEmbeds.$inferSelect;
