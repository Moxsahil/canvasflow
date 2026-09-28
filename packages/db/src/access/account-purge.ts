import type { Database } from '../client.js';
import type { AccountDeletionRow } from '../schema/account-deletion.js';
import {
  accountDeletionStorage,
  dueAccountDeletions,
  purgeAccount,
  purgeBlocker,
} from './account-deletion.js';

/**
 * Finishing the account deletions whose grace period is over — the daily
 * job's work, kept here so it is typechecked, linted and tested like the rest
 * of the package, and the script that runs it only has to connect things.
 *
 * Each account goes in the same order: everything that could refuse the
 * erasure is asked first, then its files are deleted, then its rows. Files
 * before rows because the rows are what say which folders to empty: if a run
 * stops halfway, the next one reads the same list and finishes. The other way
 * round, a stop would leave files nothing points at any more.
 */

/**
 * The little of object storage the purge needs, so it can be driven by a fake
 * in tests and by the real bucket in the job.
 */
export interface ObjectStore {
  /** One page of the keys under a prefix, and where the next page starts. */
  list(prefix: string, after?: string): Promise<{ keys: string[]; next?: string }>;
  /**
   * Delete up to a thousand keys, resolving with the ones that were not.
   * Storage reports those inside a successful answer rather than as an error,
   * so an implementation must pass them on, never drop them.
   */
  remove(keys: readonly string[]): Promise<{ key: string; reason: string }[]>;
}

/** The most one delete call takes: S3's limit, and R2's. */
const DELETE_BATCH = 1000;

/**
 * How many accounts one run erases at most. More than this due at once is
 * unlikely to be real at CanvasFlow's size, and far more likely to be a bug,
 * so the job erases this many and then fails loudly instead of carrying on.
 */
export const ACCOUNT_PURGE_LIMIT = 25;

const ACCOUNT_FOLDER =
  /^(avatars|boards)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/i;

/**
 * The second guard on what gets deleted. `accountStoragePrefixes` already
 * refuses to build anything but one account's or one board's folder; this
 * refuses to act on anything else, however it was built.
 */
function assertAccountFolder(prefix: string): void {
  if (!ACCOUNT_FOLDER.test(prefix)) {
    throw new Error(`Refusing to touch storage under ${JSON.stringify(prefix)}`);
  }
}

/** Every key in one account's or one board's folder. */
export async function listFolder(store: ObjectStore, prefix: string): Promise<string[]> {
  assertAccountFolder(prefix);
  const keys: string[] = [];
  let after: string | undefined;
  do {
    const page = await store.list(prefix, after);
    // A store that answered with keys from outside the folder must not widen
    // what gets deleted.
    keys.push(...page.keys.filter((key) => key.startsWith(prefix)));
    after = page.next;
  } while (after);
  return keys;
}

/**
 * Delete everything in one folder, and prove it is empty afterwards. Returns
 * how many files went.
 *
 * Throws rather than reports: the account's rows are erased only once its
 * files are known to be gone, and "some of them, probably" is not known.
 */
export async function emptyFolder(store: ObjectStore, prefix: string): Promise<number> {
  const keys = await listFolder(store, prefix);
  for (let i = 0; i < keys.length; i += DELETE_BATCH) {
    const refused = await store.remove(keys.slice(i, i + DELETE_BATCH));
    if (refused.length > 0) {
      throw new Error(
        `Storage refused to delete ${refused.length} file(s) under ${prefix}: ${refused[0]?.reason}`,
      );
    }
  }
  const left = await listFolder(store, prefix);
  if (left.length > 0) {
    throw new Error(`${left.length} file(s) still under ${prefix} after deleting`);
  }
  return keys.length;
}

/** One account the run erased — or, on a dry run, would have. */
export interface PurgedAccount {
  requestId: string;
  folders: number;
  files: number;
  boards: number;
}

export interface AccountPurgeReport {
  dryRun: boolean;
  purged: PurgedAccount[];
  /** Left as they were, apart from any files already gone; the next run tries again. */
  failed: { requestId: string; error: string }[];
  /** Due, but past this run's limit. */
  waiting: number;
}

export interface AccountPurgeOptions {
  db: Database;
  store: ObjectStore;
  /** Count what would go, and delete nothing. */
  dryRun: boolean;
  now?: Date;
  limit?: number;
  /** Only these accounts — for a test sharing its database with other work. */
  userIds?: readonly string[];
}

/**
 * Erase every account whose grace period is over, up to the limit.
 *
 * One account failing does not stop the others: it is reported, left for the
 * next run, and makes the job fail so somebody looks.
 */
export async function runAccountPurge(options: AccountPurgeOptions): Promise<AccountPurgeReport> {
  const { db, store, dryRun, now = new Date(), limit = ACCOUNT_PURGE_LIMIT, userIds } = options;

  const due = (await dueAccountDeletions(db, now)).filter(
    (request) => !userIds || userIds.includes(request.userId),
  );
  const batch = due.slice(0, limit);
  const report: AccountPurgeReport = {
    dryRun,
    purged: [],
    failed: [],
    waiting: due.length - batch.length,
  };

  for (const request of batch) {
    try {
      report.purged.push(await purgeOne(db, store, request, now, dryRun));
    } catch (error) {
      report.failed.push({
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return report;
}

async function purgeOne(
  db: Database,
  store: ObjectStore,
  request: AccountDeletionRow,
  now: Date,
  dryRun: boolean,
): Promise<PurgedAccount> {
  // Asked before anything is deleted, so an account the database step would
  // refuse does not lose its files first.
  const blocker = await purgeBlocker(db, request.userId);
  if (blocker) throw new Error(`Refusing to purge ${request.id}: the account ${blocker}`);

  const folders = await accountDeletionStorage(db, request);
  const boards = folders.filter((prefix) => prefix.startsWith('boards/')).length;

  let files = 0;
  if (dryRun) {
    for (const prefix of folders) files += (await listFolder(store, prefix)).length;
    return { requestId: request.id, folders: folders.length, files, boards };
  }

  for (const prefix of folders) files += await emptyFolder(store, prefix);

  const outcome = await purgeAccount(db, request.id, now);
  if (!outcome.ok) {
    throw new Error(`Files deleted, but the database step answered ${outcome.reason}`);
  }
  return {
    requestId: request.id,
    folders: folders.length,
    files,
    boards: outcome.deletedBoardIds.length,
  };
}
