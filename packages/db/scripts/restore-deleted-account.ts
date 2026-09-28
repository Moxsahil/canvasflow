import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env') });
import { parseEnv } from '../src/env.js';
import { createClient } from '../src/client.js';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  cancelAccountDeletion,
} from '../src/access/account-deletion.js';
import {
  findAccountDeletions,
  parseRestoreArgs,
  restorePlan,
  timeLeft,
  type AccountDeletionLookup,
} from '../src/access/account-restore.js';

/**
 * Restore an account whose deletion is still inside its grace period — the
 * tool the runbook in docs/account-deletion.md uses when somebody writes to
 * support to say they didn't mean it.
 *
 * Shows what it would do and changes nothing, unless given --confirm.
 *
 *   pnpm --filter @canvasflow/db restore:account pat@example.com
 *   pnpm --filter @canvasflow/db restore:account pat@example.com --confirm
 *   pnpm --filter @canvasflow/db restore:account pat@example.com --user <account id>
 *
 * Works on whatever DATABASE_URL names: the development database from the
 * root .env, or production when the runbook passes it explicitly. The first
 * line it prints says which.
 */

const USAGE =
  'Usage: pnpm --filter @canvasflow/db restore:account <email> [--confirm] [--user <account id>]';

const WHEN = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
});
const at = (date: Date) => `${WHEN.format(date)} UTC`;

function describe(account: AccountDeletionLookup): string {
  return `${account.name} <${account.email}>, account ${account.userId}`;
}

async function main(): Promise<number> {
  const args = parseRestoreArgs(process.argv.slice(2));
  if ('error' in args) {
    console.error(args.error);
    console.error(USAGE);
    return 1;
  }

  // With the development settings the database client prints every query,
  // which would bury this summary under SQL — addresses included.
  process.env.NODE_ENV = 'production';
  const env = parseEnv();
  const db = createClient(env.DATABASE_URL);
  console.log(`Database: ${new URL(env.DATABASE_URL).host}`);

  const now = new Date();
  const plan = restorePlan(await findAccountDeletions(db, args.email), now, args.userId);

  switch (plan.kind) {
    case 'no-account':
      console.log(
        `No account has the address ${args.email}. An account deleted more than ` +
          `${ACCOUNT_DELETION_GRACE_DAYS} days ago has been erased, and cannot be restored.`,
      );
      return 1;

    case 'nothing-pending':
      for (const account of plan.accounts) console.log(`- ${describe(account)}`);
      console.log('No deletion is waiting for that address, so there is nothing to restore.');
      return 1;

    case 'choose':
      console.log('More than one account uses that address and has a deletion waiting:');
      for (const account of plan.accounts) console.log(`- ${describe(account)}`);
      console.log('Run again with --user and the id of the one they mean.');
      return 1;

    case 'too-late':
      console.log(describe(plan.account));
      console.log(
        `Its grace period ended ${at(plan.request.purgeAfter)}. The erasure may already ` +
          'have started, so it can no longer be restored.',
      );
      return 1;

    case 'restorable':
      break;
  }

  const { account, request } = plan;
  console.log(describe(account));
  console.log(`Asked to delete: ${at(request.requestedAt)}`);
  console.log(
    `Erased after:    ${at(request.purgeAfter)} (${timeLeft(
      request.purgeAfter.getTime() - now.getTime(),
    )} from now)`,
  );
  console.log(`Boards to bring back: ${account.hiddenBoards}`);

  if (!args.confirm) {
    console.log('Nothing has changed. Run the same command with --confirm to restore it.');
    return 0;
  }

  const outcome = await cancelAccountDeletion(db, account.userId, now);
  if (!outcome.ok) {
    // Only if something changed between the lookup and now: another restore,
    // or the grace period running out in between.
    console.error(`Not restored: ${outcome.reason}.`);
    return 1;
  }

  console.log(
    `Restored. ${outcome.restoredBoardIds.length} board(s) are back, and the account can sign in again.`,
  );
  console.log('Now reply to them: see "Reply" in docs/account-deletion.md.');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error('Failed to restore:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
