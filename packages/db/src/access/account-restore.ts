import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { accountDeletions, type AccountDeletionRow } from '../schema/account-deletion.js';
import { boards } from '../schema/boards.js';
import { users } from '../schema/users.js';

/**
 * Restoring an account whose deletion is still inside its grace period: what
 * support does when somebody writes in to say they didn't mean it. The undo
 * itself is `cancelAccountDeletion`; this is everything around it — finding the
 * account from the address they wrote from, deciding what can be done, and
 * reading the tool's arguments — kept here so it is typechecked and tested,
 * and `scripts/restore-deleted-account.ts` only has to print.
 */

export interface AccountDeletionLookup {
  userId: string;
  name: string;
  email: string;
  /**
   * The account's deletion request that is waiting, if any, else its latest;
   * null when it never made one.
   */
  request: AccountDeletionRow | null;
  /** Boards that request hid: the ones a restore brings back. */
  hiddenBoards: number;
}

/**
 * Every account an address belongs to, each with its latest deletion request.
 *
 * Matched without regard to case, as sign-in matches. A few addresses predate
 * that rule and still belong to two accounts, which is why this answers with a
 * list. An account already erased is not found at all: its address was the
 * first thing to go.
 */
export async function findAccountDeletions(
  db: Database,
  email: string,
): Promise<AccountDeletionLookup[]> {
  const found = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      and(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`, eq(users.isGuest, false)),
    );

  return Promise.all(
    found.map(async (account) => {
      // The one waiting, when there is one — the unique index allows at most
      // one — and otherwise the most recent, so "nothing waiting" can say why.
      const [request] = await db
        .select()
        .from(accountDeletions)
        .where(eq(accountDeletions.userId, account.userId))
        .orderBy(
          sql`${accountDeletions.status} = 'scheduled' desc`,
          desc(accountDeletions.requestedAt),
        )
        .limit(1);

      let hiddenBoards = 0;
      if (request?.status === 'scheduled') {
        const [row] = await db
          .select({ n: count() })
          .from(boards)
          .where(
            and(eq(boards.ownerId, account.userId), eq(boards.deletedAt, request.requestedAt)),
          );
        hiddenBoards = row?.n ?? 0;
      }

      return { ...account, request: request ?? null, hiddenBoards };
    }),
  );
}

/**
 * What can be done for an address.
 *
 * - `no-account`: nobody has it — never did, or the account is already erased.
 * - `nothing-pending`: the account exists and has no deletion waiting.
 * - `choose`: several accounts share the address and have one waiting; the
 *   tool needs `--user` to know which.
 * - `too-late`: the grace period is over, and the erasure may have begun.
 * - `restorable`: the one account, and its request, that a restore would undo.
 */
export type RestorePlan =
  | { kind: 'no-account' }
  | { kind: 'nothing-pending'; accounts: AccountDeletionLookup[] }
  | { kind: 'choose'; accounts: AccountDeletionLookup[] }
  | { kind: 'too-late'; account: AccountDeletionLookup; request: AccountDeletionRow }
  | { kind: 'restorable'; account: AccountDeletionLookup; request: AccountDeletionRow };

export function restorePlan(
  found: readonly AccountDeletionLookup[],
  now: Date,
  userId?: string,
): RestorePlan {
  const candidates = userId ? found.filter((account) => account.userId === userId) : [...found];
  if (candidates.length === 0) return { kind: 'no-account' };

  const pending = candidates.filter((account) => account.request?.status === 'scheduled');
  if (pending.length === 0) return { kind: 'nothing-pending', accounts: candidates };
  if (pending.length > 1) return { kind: 'choose', accounts: pending };

  const account = pending[0]!;
  const request = account.request!;
  // The same rule `cancelAccountDeletion` applies, so the preview never offers
  // a restore that would then be refused.
  if (request.purgeAfter <= now) return { kind: 'too-late', account, request };
  return { kind: 'restorable', account, request };
}

const HOUR_MS = 60 * 60 * 1000;

/** "3 days 4 hours", for how long is left to restore — rounded down, never promising more. */
export function timeLeft(ms: number): string {
  const hours = Math.max(0, Math.floor(ms / HOUR_MS));
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const parts = [
    ...(days > 0 ? [`${days} ${days === 1 ? 'day' : 'days'}`] : []),
    ...(rest > 0 || days === 0 ? [`${rest} ${rest === 1 ? 'hour' : 'hours'}`] : []),
  ];
  return parts.join(' ');
}

export interface RestoreArgs {
  /** The address the person wrote from. */
  email: string;
  /** Without it, the tool only shows what it would do. */
  confirm: boolean;
  /** Which account, when the address belongs to more than one. */
  userId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The tool's arguments, or the sentence that says what is wrong with them. */
export function parseRestoreArgs(argv: readonly string[]): RestoreArgs | { error: string } {
  let email: string | undefined;
  let confirm = false;
  let userId: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    if (arg === '--confirm') {
      confirm = true;
    } else if (arg === '--user') {
      userId = argv[i + 1];
      i += 1;
      if (!userId || !UUID.test(userId)) return { error: '--user needs an account id.' };
    } else if (arg.startsWith('-')) {
      return { error: `Unknown option ${arg}.` };
    } else if (email === undefined) {
      email = arg.trim();
    } else {
      return { error: 'Give one email address.' };
    }
  }

  if (!email || !EMAIL.test(email)) {
    return { error: 'Give the email address the person wrote from.' };
  }
  return { email, confirm, ...(userId ? { userId } : {}) };
}
