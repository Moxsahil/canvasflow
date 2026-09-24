import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env') });
import { and, isNotNull, lt, or } from 'drizzle-orm';
import { parseEnv } from '../src/env.js';
import { createClient } from '../src/client.js';
import { passwordResetRequests, passwordResetTokens } from '../src/schema/index.js';

/**
 * Remove password-reset rows that no longer count towards anything.
 *
 * REQUESTS — kept a day. They exist only to be counted by the per-address
 * limit, whose longest window is an hour. A day clears that many times over
 * and leaves margin if this job runs late or the window is widened; deleting a
 * row the moment it stops counting would hand whoever wrote it a fresh
 * allowance at exactly the wrong moment. The address is stored only as a
 * digest, so nothing here is a list of people.
 *
 * TOKENS — kept a week once spent, replaced or expired, the same retention as
 * verification links, so "I clicked the link and it said expired" can still be
 * looked into for a few days afterwards.
 *
 * Safe to re-run, and safe to run while the service is up.
 *
 * Usage:  pnpm --filter @canvasflow/db prune:password-resets
 */

/** Must stay comfortably above the reset limiter's longest window, one hour. */
const REQUEST_RETENTION_HOURS = 24;
const TOKEN_RETENTION_DAYS = 7;

async function main(): Promise<void> {
  const env = parseEnv();
  const db = createClient(env.DATABASE_URL);

  const now = new Date();
  const requestCutoff = new Date(now.getTime() - REQUEST_RETENTION_HOURS * 60 * 60 * 1000);
  const tokenCutoff = new Date(now.getTime() - TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const requests = await db
    .delete(passwordResetRequests)
    .where(lt(passwordResetRequests.createdAt, requestCutoff))
    .returning({ id: passwordResetRequests.id });

  const tokens = await db
    .delete(passwordResetTokens)
    .where(
      and(
        lt(passwordResetTokens.createdAt, tokenCutoff),
        // Spelled out rather than relying on age alone, so raising the link
        // lifetime later can never make this delete a link that still works.
        or(isNotNull(passwordResetTokens.usedAt), lt(passwordResetTokens.expiresAt, now)),
      ),
    )
    .returning({ id: passwordResetTokens.id });

  console.log(
    `Pruned ${requests.length} reset request(s) older than ${REQUEST_RETENTION_HOURS} hours ` +
      `and ${tokens.length} reset link(s) older than ${TOKEN_RETENTION_DAYS} days.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('Failed to prune password resets:', error);
    process.exit(1);
  });
