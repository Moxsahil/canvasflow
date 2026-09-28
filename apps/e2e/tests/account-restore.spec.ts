import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import {
  accountDeletions,
  auditLog,
  boards,
  cancelAccountDeletion,
  createClient,
  findAccountDeletions,
  memberships,
  requestAccountDeletion,
  restorePlan,
  users,
  workspaces,
} from '@canvasflow/db';

/**
 * Restoring an account inside its grace period, as support does from the
 * runbook, against the development database: finding it from the address the
 * person wrote from, the restore itself and what it records, and the refusal
 * once the grace period is over.
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
const EMAIL = `e2e-restore-${suffix}@example.com`;
const DAY_MS = 24 * 60 * 60 * 1000;
const made = { user: '', workspace: '', board: '', requestId: '' };

test.beforeAll(async () => {
  const [user] = await db!
    .insert(users)
    .values({ email: EMAIL, name: 'E2E Restore' })
    .returning({ id: users.id });
  const [workspace] = await db!
    .insert(workspaces)
    .values({ name: 'E2E Restore', slug: `e2e-restore-${suffix}` })
    .returning({ id: workspaces.id });
  made.user = user!.id;
  made.workspace = workspace!.id;
  await db!
    .insert(memberships)
    .values({ workspaceId: made.workspace, userId: made.user, role: 'owner' });
  const [board] = await db!
    .insert(boards)
    .values({ workspaceId: made.workspace, ownerId: made.user, title: 'Restore board' })
    .returning({ id: boards.id });
  made.board = board!.id;
});

test.afterAll(async () => {
  if (!db || !made.user) return;
  await db.delete(boards).where(eq(boards.ownerId, made.user));
  if (made.workspace) await db.delete(workspaces).where(eq(workspaces.id, made.workspace));
  await db.delete(accountDeletions).where(eq(accountDeletions.userId, made.user));
  await db.delete(auditLog).where(eq(auditLog.targetId, made.user));
  await db.delete(users).where(eq(users.id, made.user));
});

test('finds the account from the address, however it was typed, with what comes back', async () => {
  const outcome = await requestAccountDeletion(db!, made.user);
  expect(outcome.ok).toBe(true);
  if (outcome.ok) made.requestId = outcome.request.id;

  const found = await findAccountDeletions(db!, `  ${EMAIL.toUpperCase()} `);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({
    userId: made.user,
    hiddenBoards: 1,
    request: { id: made.requestId, status: 'scheduled' },
  });
  expect(restorePlan(found, new Date())).toMatchObject({ kind: 'restorable' });
});

test('restoring unlocks the account, brings its board back and records it', async () => {
  expect(await cancelAccountDeletion(db!, made.user)).toEqual({
    ok: true,
    restoredBoardIds: [made.board],
  });

  const [account] = await db!
    .select({ disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, made.user));
  expect(account?.disabledAt).toBeNull();

  const [board] = await db!
    .select({ deletedAt: boards.deletedAt })
    .from(boards)
    .where(eq(boards.id, made.board));
  expect(board?.deletedAt).toBeNull();

  const [logged] = await db!
    .select({ actorId: auditLog.actorId, metadata: auditLog.metadata })
    .from(auditLog)
    .where(
      and(eq(auditLog.targetId, made.user), eq(auditLog.action, 'auth.account.deletion_cancelled')),
    );
  expect(logged).toEqual({
    actorId: null,
    metadata: { requestId: made.requestId, restoredBoards: 1 },
  });

  // Nothing is waiting any more, and the lookup says so.
  expect(restorePlan(await findAccountDeletions(db!, EMAIL), new Date())).toMatchObject({
    kind: 'nothing-pending',
  });
});

test('once the grace period is over, it is too late, whatever came before', async () => {
  // Asked eight days ago — dated before the cancelled request above, so the
  // lookup has to prefer the one waiting over the most recent.
  const late = await requestAccountDeletion(db!, made.user, new Date(Date.now() - 8 * DAY_MS));
  expect(late.ok).toBe(true);

  expect(restorePlan(await findAccountDeletions(db!, EMAIL), new Date())).toMatchObject({
    kind: 'too-late',
  });
  expect(await cancelAccountDeletion(db!, made.user)).toEqual({ ok: false, reason: 'too-late' });
});

test('an address nobody has finds nothing', async () => {
  const found = await findAccountDeletions(db!, `nobody-${suffix}@example.com`);
  expect(found).toEqual([]);
  expect(restorePlan(found, new Date())).toEqual({ kind: 'no-account' });
});
