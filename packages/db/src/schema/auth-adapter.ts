import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Table views passed to `DrizzleAdapter()`.
 *
 * @auth/drizzle-adapter's default schema expects tables named
 * `user`/`account`/`session`/`verificationToken` with specific column
 * names (e.g. `image`, `emailVerified`, `refresh_token`). Our physical
 * tables are `users`/`accounts`/`sessions`/`verifications_token` with
 * different column names — these definitions map the adapter's expected
 * shape onto those existing columns so DrizzleAdapter(db, authAdapterSchema)
 * queries the right tables.
 */

export const authAdapterUsers = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
  image: text('avatar_url'),
});

export const authAdapterAccounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => ({
    compositePk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
  }),
);

export const authAdapterSessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
});

export const authAdapterVerificationTokens = pgTable(
  'verifications_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => ({
    compositePk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);
