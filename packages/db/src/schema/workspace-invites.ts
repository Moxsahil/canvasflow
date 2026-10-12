import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { workspaceRoleEnum, workspaces } from './workspaces.js';

/**
 * An invitation, sent by email, to join a workspace.
 *
 * Unlike a share link, accepting one writes a `memberships` row: the person
 * joins the workspace and so reaches every board in it. That is why it goes to
 * one address rather than to whoever holds a URL, and why only the person
 * signed in with that address can accept it.
 *
 * Only the SHA-256 of the token is kept, as for share links and password
 * resets: a copy of this table cannot be turned into working invitations.
 * Sending it again replaces the token, so the link in an older email stops
 * working the moment a newer one goes out.
 *
 * The row stays after it is accepted or revoked, as the record of who asked
 * whom in and when.
 */
export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Lower-cased and trimmed, so one address is one invitation however it was typed. */
    email: text('email').notNull(),
    /** What they join as. Never owner: a workspace has one, and it is handed over, not sent. */
    role: workspaceRoleEnum('role').notNull().default('member'),
    /** SHA-256 of the token in the email. Never the token itself. */
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Compared against the server clock. Sending again moves it on. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** When the latest email went out, which is what paces sending it again. */
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull().defaultNow(),
    sendCount: integer('send_count').notNull().default(1),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    /**
     * One open invitation per address per workspace. Two people inviting the
     * same address at once both pass any check made before the insert; this is
     * what decides, and the second is told it is already invited.
     */
    onePendingPerEmail: uniqueIndex('workspace_invites_one_pending_per_email')
      .on(table.workspaceId, table.email)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    /** The Members window's list of who is still to answer. */
    workspaceIdx: index('workspace_invites_workspace_id_idx').on(table.workspaceId),
    notOwner: check('workspace_invites_role_not_owner', sql`${table.role} <> 'owner'`),
  }),
);

export type WorkspaceInviteRow = typeof workspaceInvites.$inferSelect;
export type NewWorkspaceInviteRow = typeof workspaceInvites.$inferInsert;
