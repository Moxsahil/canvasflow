import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env') });
import { lt } from 'drizzle-orm';
import { parseEnv } from '../src/env.js';
import { createClient } from '../src/client.js';
import { signInFailures } from '../src/schema/index.js';

/**
 * Remove failed sign-in records that no longer count towards anything.
 *
 * These rows exist only to be counted: the sign-in limiter asks how many
 * failures an address has collected in the last fifteen minutes. Once a row is
 * older than that window, nothing will ever read it again.
 *
 * WHY A DAY AND NOT FIFTEEN MINUTES
 *
 * Deleting a row the moment it stops counting would hand whoever wrote it a
 * fresh allowance at exactly the wrong moment, and leaves no margin if this
 * job is late or the window is widened later. A day clears the window many
 * times over and still keeps the table small — a sustained attack on one
 * address writes forty rows an hour, which is nothing.
 *
 * Nothing here is a person's data: the address is stored only as a digest,
 * precisely because these rows include addresses nobody has an account on.
 *
 * Safe to re-run, and safe to run while the service is up.
 *
 * Usage:  pnpm --filter @canvasflow/db prune:sign-in-failures
 */

/** Must stay comfortably above the limiter's window, fifteen minutes. */
const RETENTION_HOURS = 24;

async function main(): Promise<void> {
  const env = parseEnv();
  const db = createClient(env.DATABASE_URL);

  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  const deleted = await db
    .delete(signInFailures)
    .where(lt(signInFailures.createdAt, cutoff))
    .returning({ id: signInFailures.id });

  console.log(`Pruned ${deleted.length} sign-in failure(s) older than ${RETENTION_HOURS} hours.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('Failed to prune sign-in failures:', error);
    process.exit(1);
  });
