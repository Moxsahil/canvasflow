import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Things someone saved from a board to use again on any board: a personal
 * library, which follows the account rather than the board or the browser.
 *
 * `shapes` holds what the board's own clipboard would — the shapes as plain
 * objects — and is never trusted on the way out: the editor rebuilds every
 * shape through the same sanitizer a board file goes through before any of
 * it reaches a board. The server only checks the size and the outline of
 * what it stores, so a bad write can cost space and nothing more.
 *
 * Owned by one account. Removed with it: by the purge of a deleted account,
 * and by the cascade should the account row itself ever go.
 */
export const libraryItems = pgTable(
  'library_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    shapes: jsonb('shapes').notNull(),
    /**
     * The stored shapes' size as JSON, in bytes. Kept so a library can be
     * held to a total without reading every item to add them up — and with
     * it, so the one request that lists a library stays a bounded size.
     */
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** The one read: an owner's items, newest first. */
    ownerCreatedIdx: index('library_items_owner_created_idx').on(table.ownerId, table.createdAt),
  }),
);

export type LibraryItemRow = typeof libraryItems.$inferSelect;
