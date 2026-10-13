import { date, index, integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';
import { users } from './users.js';

/**
 * Who changed which board on which day — what the weekly digest is built from.
 *
 * `board_updates` cannot answer this: it keeps only the last few snapshots of
 * each board, and each names whoever happened to trigger the save. The
 * sync-server counts every change it accepts, by the person whose connection
 * sent it, and adds the counts here about once a minute, one row per board,
 * person and day.
 *
 * A count of document updates, not of anything a person would call an edit
 * — a drag is many — so it orders boards by how busy they were and is never
 * shown as a number. Rows older than the digest needs are pruned when it runs.
 */
export const boardActivity = pgTable(
  'board_activity',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The UTC day the changes were made. */
    day: date('day', { mode: 'string' }).notNull(),
    changes: integer('changes').notNull().default(0),
    lastAt: timestamp('last_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.boardId, table.userId, table.day] }),
    /** "What happened on these boards this week?" */
    boardDayIdx: index('board_activity_board_day_idx').on(table.boardId, table.day),
  }),
);
