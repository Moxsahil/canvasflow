import { integer, pgTable, primaryKey, text, uuid, index, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { relations } from 'drizzle-orm';

/**
 * OAuth provider accounts linked to users.
 * One user can have multiple accounts (Google + GitHub on same email).
 */

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (table) => ({
    compositePk: primaryKey({
      name: 'accounts_provider_provider_account_id',
      columns: [table.provider, table.providerAccountId],
    }),
    userIdIdx: index('accounts_user_id_idx').on(table.userId),
  }),
);

/**
 * Database-backed sessions. Auth.js manages create/lookup/expire automatically.
 */

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

/**
 * One-time tokens for email verification + password reset.
 */

export const verificationTokens = pgTable(
  'verifications_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (table) => ({
    compositePk: primaryKey({
      name: 'verification_tokens_identifier_token_pk',
      columns: [table.identifier, table.token],
    }),
  }),
);
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export type AccountRow = typeof accounts.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type VerificationTokenRow = typeof verificationTokens.$inferSelect;
