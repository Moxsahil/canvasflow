import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';
import { users } from './users.js';

/**
 * Something somebody was told about, or would have been: one row per person
 * per thing that happened, whether or not an email went out.
 *
 * Written before any email is sent, under a unique key, which is what makes a
 * mention email go once however often its comment is reported — a retry, an
 * edit that keeps the same name, a second tab. `emailedAt` says whether this
 * one was mailed; a row without it was held back (the switch was off, the
 * address unconfirmed, or the person was mailed about this board moments
 * ago), and is what an in-app list can show later.
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** What happened. Only `comment-mention` so far. */
    kind: text('kind').notNull(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    /**
     * What on the board it is about — a comment's id. Written by the browser
     * that made it, so unique only within its board.
     */
    sourceId: text('source_id').notNull(),
    /** Who did it. Kept when they delete their account, as nobody. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    emailedAt: timestamp('emailed_at', { withTimezone: true }),
  },
  (table) => ({
    once: uniqueIndex('notification_deliveries_once').on(
      table.kind,
      table.boardId,
      table.sourceId,
      table.recipientId,
    ),
    /** "Was this person mailed about this board a moment ago?" */
    recentIdx: index('notification_deliveries_recent_idx').on(
      table.recipientId,
      table.boardId,
      table.emailedAt,
    ),
    kindCheck: check('notification_deliveries_kind', sql`${table.kind} in ('comment-mention')`),
  }),
);

export type NotificationDeliveryRow = typeof notificationDeliveries.$inferSelect;
