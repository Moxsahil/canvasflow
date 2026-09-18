import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env') });
import { and, isNotNull, lt, or } from 'drizzle-orm';
import { parseEnv } from '../src/env.js';
import { createClient } from '../src/client.js';
import { emailVerificationTokens } from '../src/schema/index.js';

/**
 * Remove verification challenges that can no longer do anything.
 *
 * A row is dead once it has been spent or its expiry has passed, and nothing
 * reads a dead row afterwards — verification looks one up only to explain why
 * a link failed, and that explanation stops mattering long before a week is
 * out. Left alone they accumulate for the life of the product.
 *
 * WHY SEVEN DAYS AND NOT IMMEDIATELY
 *
 * These rows are also the resend limiter's counter. It decides whether an
 * account may ask for another link by counting rows written in the last
 * minute, hour and day, which is what lets that limit survive a restart
 * without a cache. Deleting a row inside those windows would hand its owner a
 * fresh allowance, so the retention here has to clear the longest one with
 * room to spare. Seven days is far past a day and still keeps the table small.
 *
 * Live challenges are never touched, whatever their age.
 *
 * Safe to re-run, and safe to run while the service is up: it only deletes
 * rows nothing will read again.
 *
 * Usage:  pnpm --filter @canvasflow/db prune:verification-tokens
 */

/** Must stay comfortably above the resend limiter's longest window, one day. */
const RETENTION_DAYS = 7;

async function main(): Promise<void> {
  const env = parseEnv();
  const db = createClient(env.DATABASE_URL);

  const now = new Date();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(emailVerificationTokens)
    .where(
      and(
        lt(emailVerificationTokens.createdAt, cutoff),
        // Spelled out rather than relying on age alone. Today's thirty minute
        // expiry means anything a week old is dead by definition, but that TTL
        // is a constant somebody may raise, and this should not quietly start
        // deleting live challenges when they do.
        or(isNotNull(emailVerificationTokens.usedAt), lt(emailVerificationTokens.expiresAt, now)),
      ),
    )
    .returning({ id: emailVerificationTokens.id });

  console.log(
    `Pruned ${deleted.length} verification token row(s) older than ${RETENTION_DAYS} days.`,
  );
}

main().catch((err) => {
  console.error('Prune failed:', err);
  process.exit(1);
});
