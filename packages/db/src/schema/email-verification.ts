import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';

/**
 * One email-verification challenge.
 *
 * The challenge lives here; the answer lives on the user. `users.email_verified_at`
 * stays the authoritative record of whether an address is confirmed, and this
 * table only ever holds the outstanding attempts to confirm it. Nothing reads
 * a row here to decide that someone is verified.
 *
 * Replaces `verifications_token`, which was shaped by the Auth.js adapter
 * rather than by this flow: it stored the token in the clear, keyed on an
 * address string, bound to no account, and had nowhere to record that a link
 * had already been spent.
 */
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * SHA-256 of the token, never the token itself. The raw value goes into
     * the verification URL and exists nowhere else, so a leaked dump cannot be
     * replayed as working links.
     */
    tokenHash: text('token_hash').notNull().unique(),
    /**
     * Compared against the server clock. The browser holding the link is never
     * asked whether it is still good.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Stamped once the link is spent. Null means still outstanding. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('email_verification_tokens_user_id_idx').on(table.userId),
    expiresIdx: index('email_verification_tokens_expires_at_idx').on(table.expiresAt),
  }),
);

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

export type EmailVerificationTokenRow = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationTokenRow = typeof emailVerificationTokens.$inferInsert;
