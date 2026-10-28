import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { workspacePlanEnum, workspaces } from './workspaces.js';

/**
 * A checkout someone opened for a workspace, kept so a subscription that
 * comes back from the payment provider can be traced to the workspace it was
 * bought for even if the provider drops the metadata we sent with it.
 *
 * The id is the provider's. Rows are never updated: a checkout that is never
 * paid simply never has a subscription pointing at it.
 */
export const billingCheckouts = pgTable(
  'billing_checkouts',
  {
    id: text('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    plan: workspacePlanEnum('plan').notNull(),
    cycle: text('cycle').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cycleKnown: check(
      'billing_checkouts_cycle_known',
      sql`${table.cycle} in ('monthly', 'yearly')`,
    ),
  }),
);

/**
 * Each paid subscription as the payment provider last described it.
 *
 * The provider is the record of truth: a row here is a copy of its latest
 * snapshot, replaced whole on every webhook and never edited by hand. What
 * plan a workspace is on is worked out from these rows, so a lost or repeated
 * webhook is corrected by the next one rather than piling up.
 *
 * `sourceModifiedAt` is the provider's own timestamp for the snapshot. Webhooks
 * can arrive out of order, and an older snapshot never replaces a newer one.
 */
export const workspaceSubscriptions = pgTable(
  'workspace_subscriptions',
  {
    id: text('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    customerId: text('customer_id').notNull(),
    plan: workspacePlanEnum('plan').notNull(),
    cycle: text('cycle').notNull(),
    status: text('status').notNull(),
    seats: integer('seats'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    sourceModifiedAt: timestamp('source_modified_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byWorkspace: index('workspace_subscriptions_workspace_idx').on(table.workspaceId),
    cycleKnown: check(
      'workspace_subscriptions_cycle_known',
      sql`${table.cycle} in ('monthly', 'yearly')`,
    ),
  }),
);

export type BillingCheckoutRow = typeof billingCheckouts.$inferSelect;
export type WorkspaceSubscriptionRow = typeof workspaceSubscriptions.$inferSelect;
