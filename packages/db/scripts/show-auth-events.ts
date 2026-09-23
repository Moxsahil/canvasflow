import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env') });
import { desc, eq, like, or } from 'drizzle-orm';
import { parseEnv } from '../src/env.js';
import { createClient } from '../src/client.js';
import { auditLog, users } from '../src/schema/index.js';

/**
 * Print the recent authentication events.
 *
 *   pnpm --filter @canvasflow/db show:auth-events
 *
 * These rows have no screen anywhere in the product, which is the point of
 * them: they are for the question asked afterwards — when did this account
 * sign in, from where, and was anything caught. Without a way to read them
 * they may as well not be written.
 *
 * Read-only. Safe against production.
 */

const LIMIT = 25;

async function main(): Promise<void> {
  const env = parseEnv();
  const db = createClient(env.DATABASE_URL);

  const rows = await db
    .select({
      at: auditLog.createdAt,
      action: auditLog.action,
      email: users.email,
      ip: auditLog.ipAddress,
      userAgent: auditLog.userAgent,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(or(like(auditLog.action, 'auth.%'), eq(auditLog.targetType, 'session')))
    .orderBy(desc(auditLog.createdAt))
    .limit(LIMIT);

  if (rows.length === 0) {
    console.log('\nNo authentication events recorded yet.\n');
    return;
  }

  console.log(`\nLast ${rows.length} authentication event(s), newest first:\n`);
  console.table(
    rows.map((row) => ({
      when: row.at.toISOString().replace('T', ' ').slice(0, 19),
      action: row.action,
      account: row.email ?? '—',
      ip: row.ip ?? '—',
      // Only the leading token: a full user-agent string is a paragraph and
      // turns the table into something nobody reads.
      client: row.userAgent?.split(' ')[0] ?? '—',
      detail: Object.keys(row.metadata).length ? JSON.stringify(row.metadata) : '',
    })),
  );
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('Failed to read authentication events:', error);
    process.exit(1);
  });
