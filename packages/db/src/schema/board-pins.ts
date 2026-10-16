import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';
import { users } from './users.js';

/**
 * The boards one person has pinned to the top of their sidebar.
 *
 * Personal: a pin changes only the sidebar of whoever made it, never a
 * teammate's, so it hangs off the person and the board rather than off the
 * workspace.
 *
 * `position` is a fractional order key — a short string that sorts between
 * any two others — so a pin can be dropped between two neighbours by writing
 * this one row, without renumbering the rest. Keys compare by code unit
 * ("A" < "a"), the way they were generated, so they are sorted in code rather
 * than by the database's collation.
 */
export const boardPins = pgTable(
  'board_pins',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    position: text('position').notNull(),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.boardId] }),
    /** A board's pins go with it when it is purged. */
    boardIdx: index('board_pins_board_id_idx').on(table.boardId),
  }),
);

export type BoardPinRow = typeof boardPins.$inferSelect;
