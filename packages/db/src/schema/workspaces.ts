import { pgTable, uuid, text, pgEnum, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { relations } from 'drizzle-orm';

export const workspacePlanEnum = pgEnum('workspace_plan', ['free', 'pro', 'enterprise']);
export const workspaceRoleEnum = pgEnum('workspace_role', ['owner', 'admin', 'member']);

export const workspaces = pgTable('workspace', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  plan: workspacePlanEnum('plan').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  /**
   * Soft delete, as boards have.
   *
   * A hard delete would cascade through `memberships` and `boards` and take
   * every document in the workspace with it — the boards' own `deletedAt`
   * would never get a chance to mean anything. Keeping the row lets a delete
   * be undone by an operator, and lets the slug stay claimed so a stale link
   * resolves to nothing rather than to whatever was created next.
   *
   * Every read of a workspace has to exclude these; see access/workspaces.ts.
   */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueMembership: unique('memberships_workspace_user_unique').on(
      table.workspaceId,
      table.userId,
    ),
  }),
);

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  memberships: many(memberships),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  workspace: one(workspaces, { fields: [memberships.workspaceId], references: [workspaces.id] }),
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
}));

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;
export type MembershipRow = typeof memberships.$inferSelect;
