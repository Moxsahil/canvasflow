import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * How many diagrams each person has generated, month by month.
 *
 * One row per person per calendar month (UTC), named by the month's first day.
 * A count and nothing else: the description somebody typed is never stored,
 * only that they used one of their month's diagrams. A new month is a new row,
 * which is what resets the allowance.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: date('month', { mode: 'string' }).notNull(),
    diagrams: integer('diagrams').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.month] }),
    diagramsNotNegative: check('ai_usage_diagrams_not_negative', sql`${table.diagrams} >= 0`),
  }),
);

export type AiUsageRow = typeof aiUsage.$inferSelect;
