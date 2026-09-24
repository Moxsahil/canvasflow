import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';

/**
 * One password-reset link.
 *
 * Shaped like `email_verification_tokens` on purpose: the same kind of
 * credential, with the same rules. The link in the email carries 256 random
 * bits; only their SHA-256 is kept here, so a copy of this table cannot be
 * turned into working links.
 *
 * A row, rather than a signed token in the URL, because a row can be taken
 * back. Asking for a new link, or changing the password by any route, marks
 * every outstanding one used — a signed token would stay good until it expired.
 *
 * Nothing here decides whether somebody is signed in or what their password
 * is. It only records outstanding attempts to replace one.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the token, never the token itself. */
    tokenHash: text('token_hash').notNull().unique(),
    /** Compared against the server clock, never against anything the browser says. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /**
     * Stamped once, when the link is spent or replaced. Null means it is still
     * outstanding. Set by a conditional update, so two tabs submitting the
     * same link cannot both succeed.
     */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Cancelling every outstanding link for one account. */
    userIdx: index('password_reset_tokens_user_id_idx').on(table.userId),
    /** The prune job's sweep. */
    expiresIdx: index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
  }),
);

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

/**
 * One request for a reset link, counted against the address it was made for.
 *
 * Separate from the tokens because it has to count requests for addresses
 * that have no account. A limit that only counted real accounts would make
 * being refused for pace a way to discover which addresses exist — the one
 * thing the forgot-password route refuses to say. Shaped like
 * `sign_in_failures` for the same reason: the address is kept only as a
 * digest, since many of these were typed by somebody who does not own it.
 *
 * Rows only exist to be counted, and are pruned once they are older than the
 * longest window the limiter reads.
 */
export const passwordResetRequests = pgTable(
  'password_reset_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** SHA-256 of the submitted address, trimmed and lowercased first. */
    emailHash: text('email_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** The only query: recent requests for one address. */
    lookupIdx: index('password_reset_requests_email_hash_created_at_idx').on(
      table.emailHash,
      table.createdAt,
    ),
  }),
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type PasswordResetRequestRow = typeof passwordResetRequests.$inferSelect;
