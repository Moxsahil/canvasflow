import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import {
  accountDeletions,
  auditLog,
  boards,
  cancelAccountDeletion,
  createClient,
  DELETED_USER_NAME,
  memberships,
  requestAccountDeletion,
  runAccountPurge,
  users,
  workspaces,
  type ObjectStore,
} from '@canvasflow/db';

/**
 * The daily purge, end to end against the development database, with a bucket
 * held in memory so no real file is touched.
 *
 * Three throwaway accounts, each asked to be deleted eight days ago, so their
 * grace period is over. C owns two boards, one of them in the trash. D owns
 * nothing. F's photo is one storage refuses to delete, to show a failure stays
 * with its own account.
 *
 * Every run is limited to these three, since the development database is
 * shared with whatever else is going on.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=deletion
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ mode: 'serial' });
test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

const suffix = randomUUID().slice(0, 8);
const DAY_MS = 24 * 60 * 60 * 1000;
const UNRELATED = `boards/${randomUUID()}/somebody-else.png`;

const made = { c: '', d: '', f: '', cWorkspace: '', cBoard: '', cTrashed: '' };
const people = () => [made.c, made.d, made.f].filter(Boolean);

/** A bucket in memory. Keys in `refuse` are answered "not deleted". */
class MemoryStore implements ObjectStore {
  readonly keys = new Set<string>();
  readonly refuse = new Set<string>();

  async list(prefix: string) {
    return { keys: [...this.keys].filter((key) => key.startsWith(prefix)) };
  }

  async remove(keys: readonly string[]) {
    const refused: { key: string; reason: string }[] = [];
    for (const key of keys) {
      if (this.refuse.has(key)) refused.push({ key, reason: 'AccessDenied: Access Denied' });
      else this.keys.delete(key);
    }
    return refused;
  }
}

const store = new MemoryStore();

test.beforeAll(async () => {
  for (const who of ['c', 'd', 'f'] as const) {
    const [row] = await db!
      .insert(users)
      .values({ email: `e2e-purge-${who}-${suffix}@example.com`, name: `E2E Purge ${who}` })
      .returning({ id: users.id });
    made[who] = row!.id;
  }

  const [workspace] = await db!
    .insert(workspaces)
    .values({ name: 'E2E Purge', slug: `e2e-purge-${suffix}` })
    .returning({ id: workspaces.id });
  made.cWorkspace = workspace!.id;
  await db!
    .insert(memberships)
    .values({ workspaceId: made.cWorkspace, userId: made.c, role: 'owner' });
  const [board] = await db!
    .insert(boards)
    .values({ workspaceId: made.cWorkspace, ownerId: made.c, title: 'C board' })
    .returning({ id: boards.id });
  const [trashed] = await db!
    .insert(boards)
    .values({
      workspaceId: made.cWorkspace,
      ownerId: made.c,
      title: 'C trashed board',
      deletedAt: new Date(Date.now() - 20 * DAY_MS),
    })
    .returning({ id: boards.id });
  made.cBoard = board!.id;
  made.cTrashed = trashed!.id;

  for (const key of [
    `avatars/${made.c}/me.webp`,
    `boards/${made.cBoard}/a.png`,
    `boards/${made.cBoard}/b.png`,
    `boards/${made.cTrashed}/c.png`,
    `avatars/${made.d}/me.webp`,
    `avatars/${made.f}/me.webp`,
    UNRELATED,
  ]) {
    store.keys.add(key);
  }
  store.refuse.add(`avatars/${made.f}/me.webp`);

  // Asked eight days ago, in this order, so the grace period is a day over.
  const eightDaysAgo = Date.now() - 8 * DAY_MS;
  for (const [i, who] of [made.c, made.d, made.f].entries()) {
    const outcome = await requestAccountDeletion(db!, who, new Date(eightDaysAgo + i * 1000));
    expect(outcome.ok).toBe(true);
  }
});

test.afterAll(async () => {
  if (!db || people().length === 0) return;
  await db.delete(boards).where(inArray(boards.ownerId, people()));
  if (made.cWorkspace) await db.delete(workspaces).where(eq(workspaces.id, made.cWorkspace));
  await db.delete(accountDeletions).where(inArray(accountDeletions.userId, people()));
  await db.delete(auditLog).where(inArray(auditLog.targetId, people()));
  await db.delete(users).where(inArray(users.id, people()));
});

test('a restore is refused once the grace period is over', async () => {
  expect(await cancelAccountDeletion(db!, made.c)).toEqual({ ok: false, reason: 'too-late' });
});

test('a dry run says what would go, and deletes nothing', async () => {
  const report = await runAccountPurge({ db: db!, store, dryRun: true, userIds: [made.c] });

  expect(report.failed).toEqual([]);
  expect(report.waiting).toBe(0);
  expect(report.purged).toEqual([
    { requestId: expect.any(String), folders: 3, files: 4, boards: 2 },
  ]);
  expect(store.keys.size).toBe(7);

  const [request] = await db!
    .select({ status: accountDeletions.status })
    .from(accountDeletions)
    .where(eq(accountDeletions.userId, made.c));
  expect(request?.status).toBe('scheduled');
});

test('a run takes no more than its limit, and leaves the rest for the next', async () => {
  const report = await runAccountPurge({
    db: db!,
    store,
    dryRun: true,
    limit: 1,
    userIds: people(),
  });
  expect(report.purged).toHaveLength(1);
  expect(report.waiting).toBe(2);
});

test('the run deletes the files, then the account, and a failure stays with its own account', async () => {
  const report = await runAccountPurge({ db: db!, store, dryRun: false, userIds: people() });

  expect(report.purged.map((account) => [account.files, account.boards])).toEqual([
    [4, 2],
    [1, 0],
  ]);
  expect(report.failed).toHaveLength(1);
  expect(report.failed[0]?.error).toMatch(/refused to delete 1 file/);

  // C's and D's files are gone; F's refused photo and somebody else's stay.
  expect([...store.keys].sort()).toEqual([UNRELATED, `avatars/${made.f}/me.webp`].sort());

  const rows = await db!
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, people()));
  const byId = new Map(rows.map((row) => [row.id, row]));
  expect(byId.get(made.c)?.name).toBe(DELETED_USER_NAME);
  expect(byId.get(made.d)?.email).toBe(`deleted-${made.d}@deleted.invalid`);
  // F's rows were never touched: its files did not all go.
  expect(byId.get(made.f)?.email).toBe(`e2e-purge-f-${suffix}@example.com`);

  const requests = await db!
    .select({ userId: accountDeletions.userId, status: accountDeletions.status })
    .from(accountDeletions)
    .where(inArray(accountDeletions.userId, people()));
  const status = new Map(requests.map((row) => [row.userId, row.status]));
  expect([status.get(made.c), status.get(made.d), status.get(made.f)]).toEqual([
    'completed',
    'completed',
    'scheduled',
  ]);

  expect(
    await db!
      .select()
      .from(boards)
      .where(inArray(boards.id, [made.cBoard, made.cTrashed])),
  ).toHaveLength(0);

  const [erased] = await db!
    .select({ actorId: auditLog.actorId })
    .from(auditLog)
    .where(and(eq(auditLog.targetId, made.c), eq(auditLog.action, 'auth.account.deleted')));
  expect(erased).toEqual({ actorId: null });
});

test('the next run finishes the account that failed, and nothing else', async () => {
  store.refuse.clear();
  const report = await runAccountPurge({ db: db!, store, dryRun: false, userIds: people() });

  expect(report.failed).toEqual([]);
  expect(report.purged.map((account) => account.files)).toEqual([1]);
  expect([...store.keys]).toEqual([UNRELATED]);

  const again = await runAccountPurge({ db: db!, store, dryRun: false, userIds: people() });
  expect(again).toEqual({ dryRun: false, purged: [], failed: [], waiting: 0 });
});
