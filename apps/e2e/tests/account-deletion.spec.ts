import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import {
  accountDeletionPreview,
  accountDeletions,
  accountDeletionStorage,
  accounts,
  auditLog,
  authSessions,
  boardAccessRequests,
  boardImages,
  boardMembers,
  boards,
  boardShareLinks,
  boardUpdates,
  cancelAccountDeletion,
  createClient,
  DELETED_USER_NAME,
  emailVerificationTokens,
  lookupShareLink,
  memberships,
  passwordResetTokens,
  purgeAccount,
  requestAccountDeletion,
  resolveBoardAccess,
  users,
  workspaces,
} from '@canvasflow/db';

/**
 * Deleting an account, against a real database: the request, a restore inside
 * the grace period, and the purge — and where every kind of row ends up.
 *
 * Two throwaway people. A deletes their account. B owns a board that A worked
 * on, so the test can tell A's own data (which must go) from A's history on
 * somebody else's board (which must stay, reading as "Deleted user").
 *
 * Needs the development database in DATABASE_URL — read from the repository's
 * .env when it is not already set. No browser, no file storage: the purge's
 * storage step is only worked out here, never run.
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
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything the setup made, so the checks can name it and cleanup can find it. */
const made = {
  a: '',
  b: '',
  aWorkspace: '',
  bWorkspace: '',
  aBoard: '',
  aTrashedBoard: '',
  bBoard: '',
  aShareToken: randomBytes(32).toString('base64url'),
  aUpdateOnB: '',
  aShareLinkOnB: '',
  auditIds: [] as string[],
};

test.beforeAll(async () => {
  const [a] = await db!
    .insert(users)
    .values({ email: `e2e-deletion-a-${suffix}@example.com`, name: 'E2E Deleter' })
    .returning({ id: users.id });
  const [b] = await db!
    .insert(users)
    .values({ email: `e2e-deletion-b-${suffix}@example.com`, name: 'E2E Collaborator' })
    .returning({ id: users.id });
  made.a = a!.id;
  made.b = b!.id;

  for (const [who, key] of [
    [made.a, 'aWorkspace'],
    [made.b, 'bWorkspace'],
  ] as const) {
    const [workspace] = await db!
      .insert(workspaces)
      .values({ name: `E2E ${key}`, slug: `e2e-deletion-${key.toLowerCase()}-${suffix}` })
      .returning({ id: workspaces.id });
    made[key] = workspace!.id;
    await db!
      .insert(memberships)
      .values({ workspaceId: workspace!.id, userId: who, role: 'owner' });
  }

  const [aBoard] = await db!
    .insert(boards)
    .values({ workspaceId: made.aWorkspace, ownerId: made.a, title: 'A board' })
    .returning({ id: boards.id });
  const [aTrashed] = await db!
    .insert(boards)
    .values({
      workspaceId: made.aWorkspace,
      ownerId: made.a,
      title: 'A trashed board',
      deletedAt: new Date(Date.now() - 3 * DAY_MS),
    })
    .returning({ id: boards.id });
  const [bBoard] = await db!
    .insert(boards)
    .values({ workspaceId: made.bWorkspace, ownerId: made.b, title: 'B board' })
    .returning({ id: boards.id });
  made.aBoard = aBoard!.id;
  made.aTrashedBoard = aTrashed!.id;
  made.bBoard = bBoard!.id;

  const update = new Uint8Array([1, 2, 3]);

  // A's own board: history, an image, a share link, and B as a collaborator.
  await db!
    .insert(boardUpdates)
    .values({ boardId: made.aBoard, authorId: made.a, update, sizeBytes: 3 });
  await db!.insert(boardImages).values({
    boardId: made.aBoard,
    fileId: `e2e-${suffix}-a`,
    mimeType: 'image/png',
    sizeBytes: 10,
    uploadedBy: made.a,
  });
  await db!.insert(boardShareLinks).values({
    boardId: made.aBoard,
    tokenHash: digest(made.aShareToken),
    createdBy: made.a,
  });
  await db!
    .insert(boardMembers)
    .values({ boardId: made.aBoard, userId: made.b, grantedBy: made.a });

  // B's board: everything A left there.
  const [aUpdateOnB] = await db!
    .insert(boardUpdates)
    .values({ boardId: made.bBoard, authorId: made.a, update, sizeBytes: 3 })
    .returning({ id: boardUpdates.id });
  made.aUpdateOnB = aUpdateOnB!.id;
  await db!.insert(boardImages).values({
    boardId: made.bBoard,
    fileId: `e2e-${suffix}-b`,
    mimeType: 'image/png',
    sizeBytes: 10,
    uploadedBy: made.a,
  });
  const [aLinkOnB] = await db!
    .insert(boardShareLinks)
    .values({ boardId: made.bBoard, tokenHash: digest(randomUUID()), createdBy: made.a })
    .returning({ id: boardShareLinks.id });
  made.aShareLinkOnB = aLinkOnB!.id;
  await db!
    .insert(boardMembers)
    .values({ boardId: made.bBoard, userId: made.a, grantedBy: made.b });
  await db!
    .insert(boardAccessRequests)
    .values({ boardId: made.bBoard, requesterId: made.a, respondedBy: made.b });

  // A's sign-in and recovery data.
  const soon = new Date(Date.now() + DAY_MS);
  await db!.insert(authSessions).values({ userId: made.a, expiresAt: soon });
  await db!.insert(accounts).values({
    userId: made.a,
    type: 'oidc',
    provider: 'google',
    providerAccountId: `e2e-${suffix}`,
  });
  await db!
    .insert(emailVerificationTokens)
    .values({ userId: made.a, tokenHash: digest(randomUUID()), expiresAt: soon });
  await db!
    .insert(passwordResetTokens)
    .values({ userId: made.a, tokenHash: digest(randomUUID()), expiresAt: soon });

  // The security log: one entry of A's own, one in A's workspace.
  const logged = await db!
    .insert(auditLog)
    .values([
      {
        actorId: made.a,
        action: 'auth.login',
        targetType: 'session',
        targetId: 'e2e',
        ipAddress: '203.0.113.7',
      },
      {
        actorId: made.a,
        workspaceId: made.aWorkspace,
        action: 'board.created',
        targetType: 'board',
        targetId: made.aBoard,
      },
    ])
    .returning({ id: auditLog.id });
  made.auditIds = logged.map((row) => row.id);
});

test.afterAll(async () => {
  if (!db) return;
  const people = [made.a, made.b].filter(Boolean);
  if (people.length === 0) return;
  await db.delete(boards).where(inArray(boards.ownerId, people));
  await db
    .delete(workspaces)
    .where(inArray(workspaces.id, [made.aWorkspace, made.bWorkspace].filter(Boolean)));
  await db.delete(accountDeletions).where(inArray(accountDeletions.userId, people));
  if (made.auditIds.length > 0)
    await db.delete(auditLog).where(inArray(auditLog.id, made.auditIds));
  await db.delete(users).where(inArray(users.id, people));
});

test('the preview counts what deletion would take', async () => {
  const preview = await accountDeletionPreview(db!, made.a);

  // The trashed board goes too, but is not counted as one they would lose.
  expect(preview.ownedBoards).toBe(1);
  expect(preview.sharedBoards).toEqual([{ id: made.aBoard, title: 'A board', members: 1 }]);
  expect(preview.sharedWorkspaces).toEqual([]);
});

test('asking locks the account, hides its boards from everyone and ends its sessions', async () => {
  const now = new Date();
  const outcome = await requestAccountDeletion(db!, made.a, now);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;

  expect(outcome.hiddenBoardIds).toEqual([made.aBoard]);
  expect(outcome.request.purgeAfter.getTime() - now.getTime()).toBe(7 * DAY_MS);

  const [account] = await db!
    .select({ disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, made.a));
  expect(account?.disabledAt).toEqual(now);

  // Gone for the collaborator and for anybody holding the share link.
  expect(await resolveBoardAccess(db!, made.b, made.aBoard)).toBeNull();
  const link = await lookupShareLink(db!, made.aShareToken);
  expect(link.ok).toBe(false);

  const live = await db!
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(and(eq(authSessions.userId, made.a), eq(authSessions.revokedAt, now)));
  expect(live).toHaveLength(1);

  // B's own board is untouched.
  expect(await resolveBoardAccess(db!, made.b, made.bBoard)).not.toBeNull();
});

test('a second request while one is scheduled is refused', async () => {
  expect(await requestAccountDeletion(db!, made.a)).toEqual({
    ok: false,
    reason: 'already-scheduled',
  });
});

test('a restore inside the grace period undoes exactly what the request did', async () => {
  const outcome = await cancelAccountDeletion(db!, made.a);
  expect(outcome).toEqual({ ok: true, restoredBoardIds: [made.aBoard] });

  const owned = await db!
    .select({ id: boards.id, deletedAt: boards.deletedAt })
    .from(boards)
    .where(eq(boards.ownerId, made.a));
  const byId = new Map(owned.map((board) => [board.id, board.deletedAt]));
  expect(byId.get(made.aBoard)).toBeNull();
  // Already in the trash before the request, so it stays there.
  expect(byId.get(made.aTrashedBoard)).not.toBeNull();

  const [account] = await db!
    .select({ disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, made.a));
  expect(account?.disabledAt).toBeNull();
  expect(await resolveBoardAccess(db!, made.b, made.aBoard)).not.toBeNull();
});

test('the purge waits out the grace period, then erases the account', async () => {
  const outcome = await requestAccountDeletion(db!, made.a);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const { request } = outcome;

  expect(await purgeAccount(db!, request.id, new Date())).toEqual({
    ok: false,
    reason: 'not-due',
  });

  // Worked out before the rows it reads are deleted — the order the job runs in.
  const prefixes = await accountDeletionStorage(db!, request);
  expect(prefixes.sort()).toEqual(
    [`avatars/${made.a}/`, `boards/${made.aBoard}/`, `boards/${made.aTrashedBoard}/`].sort(),
  );

  const purged = await purgeAccount(db!, request.id, request.purgeAfter);
  expect(purged.ok).toBe(true);
  if (!purged.ok) return;
  expect(purged.deletedBoardIds.sort()).toEqual([made.aBoard, made.aTrashedBoard].sort());

  // The account row stays, saying nothing about who it was.
  const [account] = await db!.select().from(users).where(eq(users.id, made.a));
  expect(account?.name).toBe(DELETED_USER_NAME);
  expect(account?.email).toBe(`deleted-${made.a}@deleted.invalid`);
  expect(account?.disabledAt).not.toBeNull();

  // A's boards, their workspace, and everything hanging off them are gone.
  expect(
    await db!
      .select()
      .from(boards)
      .where(inArray(boards.id, [made.aBoard, made.aTrashedBoard])),
  ).toHaveLength(0);
  expect(
    await db!.select().from(boardUpdates).where(eq(boardUpdates.boardId, made.aBoard)),
  ).toHaveLength(0);
  expect(
    await db!.select().from(workspaces).where(eq(workspaces.id, made.aWorkspace)),
  ).toHaveLength(0);

  // A's access to B's board, and their sign-in and recovery data, are gone.
  for (const [table, rows] of [
    ['memberships', await db!.select().from(memberships).where(eq(memberships.userId, made.a))],
    ['board_members', await db!.select().from(boardMembers).where(eq(boardMembers.userId, made.a))],
    [
      'board_access_requests',
      await db!
        .select()
        .from(boardAccessRequests)
        .where(eq(boardAccessRequests.requesterId, made.a)),
    ],
    ['accounts', await db!.select().from(accounts).where(eq(accounts.userId, made.a))],
    ['auth_sessions', await db!.select().from(authSessions).where(eq(authSessions.userId, made.a))],
    [
      'email_verification_tokens',
      await db!
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.userId, made.a)),
    ],
    [
      'password_reset_tokens',
      await db!.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, made.a)),
    ],
  ] as const) {
    expect(rows, table).toHaveLength(0);
  }

  // A's history on B's board stays, pointing at the anonymized account.
  const [updateOnB] = await db!
    .select({ authorId: boardUpdates.authorId })
    .from(boardUpdates)
    .where(eq(boardUpdates.id, made.aUpdateOnB));
  expect(updateOnB?.authorId).toBe(made.a);
  const [linkOnB] = await db!
    .select({ createdBy: boardShareLinks.createdBy })
    .from(boardShareLinks)
    .where(eq(boardShareLinks.id, made.aShareLinkOnB));
  expect(linkOnB?.createdBy).toBe(made.a);
  expect(
    await db!
      .select()
      .from(boardImages)
      .where(and(eq(boardImages.boardId, made.bBoard), eq(boardImages.uploadedBy, made.a))),
  ).toHaveLength(1);

  // The security log keeps both entries — address included, until the
  // one-year cleanup — but neither says who any longer.
  const logged = await db!.select().from(auditLog).where(inArray(auditLog.id, made.auditIds));
  expect(logged).toHaveLength(2);
  expect(logged.every((row) => row.actorId === null && row.workspaceId === null)).toBe(true);
  expect(logged.some((row) => row.ipAddress === '203.0.113.7')).toBe(true);

  // The request is now the receipt.
  const [receipt] = await db!
    .select()
    .from(accountDeletions)
    .where(and(eq(accountDeletions.id, request.id), isNotNull(accountDeletions.completedAt)));
  expect(receipt?.status).toBe('completed');
});

test('purging a finished request again changes nothing', async () => {
  const [receipt] = await db!
    .select({ id: accountDeletions.id })
    .from(accountDeletions)
    .where(and(eq(accountDeletions.userId, made.a), eq(accountDeletions.status, 'completed')));
  expect(await purgeAccount(db!, receipt!.id, new Date(Date.now() + 30 * DAY_MS))).toEqual({
    ok: false,
    reason: 'not-scheduled',
  });
});
