import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const accountDeletionStatusEnum = pgEnum('account_deletion_status', [
  'scheduled',
  'cancelled',
  'completed',
]);

/**
 * One request to delete an account, and afterwards the record that it was done.
 *
 * Deletion happens in two steps. Asking locks the account and hides the boards
 * it owns at once; the data itself is erased after a grace period, so a
 * mistake — or somebody else holding the account — can still be undone. The
 * row is what joins the two: the grace period runs from `requestedAt`, and
 * everything the request changed is stamped with that same instant, which is
 * how a restore undoes exactly the request and nothing the person did before.
 *
 * Once `completed`, the row stays as the receipt: proof the erasure happened,
 * pointing at an account row that no longer says who anybody was.
 *
 * The account row is anonymized rather than deleted, so this reference needs
 * no delete rule, and should refuse if anything ever tries to remove one.
 */
export const accountDeletions = pgTable(
  'account_deletions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    /** The earliest the erasure may run. */
    purgeAfter: timestamp('purge_after', { withTimezone: true }).notNull(),
    status: accountDeletionStatusEnum('status').notNull().default('scheduled'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    /**
     * At most one live request per account. Two requests racing each other
     * both pass any check made before the insert; this is what decides.
     */
    oneScheduledPerUser: uniqueIndex('account_deletions_one_scheduled_per_user')
      .on(table.userId)
      .where(sql`${table.status} = 'scheduled'`),
    /** The purge job's sweep: scheduled requests whose grace period is over. */
    dueIdx: index('account_deletions_purge_after_idx')
      .on(table.purgeAfter)
      .where(sql`${table.status} = 'scheduled'`),
  }),
);

export type AccountDeletionRow = typeof accountDeletions.$inferSelect;
