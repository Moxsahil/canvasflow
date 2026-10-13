import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

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
    /** What happened. See the check below for the list. */
    kind: text('kind').notNull(),
    /** The board it happened on — or, for something about a whole workspace, null. */
    boardId: uuid('board_id').references(() => boards.id, { onDelete: 'cascade' }),
    /** The workspace it happened in, for what is about a workspace rather than one board. */
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    /**
     * What it is about: a comment's id (written by the browser that made it,
     * so unique only within its board), the person who joined, an invitation's
     * id, or a fresh id for a one-off event such as a role change.
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
    /** The same, for workspace rows, whose null board would never collide above. */
    onceInWorkspace: uniqueIndex('notification_deliveries_once_workspace')
      .on(table.kind, table.workspaceId, table.sourceId, table.recipientId)
      .where(sql`${table.boardId} is null`),
    /** And for what is about the whole account, such as a week's digest. */
    onceForAccount: uniqueIndex('notification_deliveries_once_account')
      .on(table.kind, table.sourceId, table.recipientId)
      .where(sql`${table.boardId} is null and ${table.workspaceId} is null`),
    /** "Was this person mailed about this board a moment ago?" */
    recentIdx: index('notification_deliveries_recent_idx').on(
      table.recipientId,
      table.boardId,
      table.emailedAt,
    ),
    workspaceRecentIdx: index('notification_deliveries_workspace_recent_idx').on(
      table.recipientId,
      table.workspaceId,
      table.emailedAt,
    ),
    kindCheck: check(
      'notification_deliveries_kind',
      sql`${table.kind} in ('comment-mention', 'board-joined', 'workspace-joined', 'access-changed', 'weekly-digest')`,
    ),
    /** About a board, or failing that a workspace — except a digest, which is about everything. */
    scopeCheck: check(
      'notification_deliveries_scope',
      sql`${table.boardId} is not null or ${table.workspaceId} is not null or ${table.kind} = 'weekly-digest'`,
    ),
  }),
);

export type NotificationDeliveryRow = typeof notificationDeliveries.$inferSelect;
