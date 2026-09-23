import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * One failed sign-in, counted against the address it was attempted on.
 *
 * Per-IP limits count where a request came from, which an attacker chooses. A
 * thousand rented addresses each staying politely inside their own budget is a
 * thousand times the guesses against one account, and no single address ever
 * looks wrong. This table counts the thing they cannot choose: whose account
 * they are trying to open.
 *
 * WHY A HASH AND NOT THE ADDRESS
 *
 * The limit has to count what was typed, matched to an account or not —
 * counting only real accounts would make a refusal a way to discover which
 * addresses exist, which is the exact thing sign-in refuses to say. So the
 * rows include addresses nobody here has ever had, typed by whoever is
 * guessing. Storing the digest counts identically and leaves nothing that
 * reads as a list of people.
 *
 * WHY ROWS AND NOT A COUNTER IN MEMORY
 *
 * The same reason the resend limiter counts rows: it survives a restart and
 * holds across instances. An in-memory count would reset on every deploy, and
 * deploys here are manual, so the limit would clear at unpredictable moments.
 *
 * Rows are pruned on a schedule; see the prune script for the retention.
 */
export const signInFailures = pgTable(
  'sign_in_failures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** SHA-256 of the submitted address, lowercased and trimmed first. */
    emailHash: text('email_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** The only query: recent failures for one address. */
    lookupIdx: index('sign_in_failures_email_hash_created_at_idx').on(
      table.emailHash,
      table.createdAt,
    ),
  }),
);

export type SignInFailureRow = typeof signInFailures.$inferSelect;
