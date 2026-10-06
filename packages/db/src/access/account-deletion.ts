import { and, count, eq, inArray, isNull, lte, ne } from 'drizzle-orm';
import { ACCOUNT_DELETION_GRACE_DAYS, DEFAULT_USER_PREFERENCES } from '@canvasflow/types';
import type { Database, DatabaseExecutor } from '../client.js';
import { accountDeletions, type AccountDeletionRow } from '../schema/account-deletion.js';
import { accounts, sessions } from '../schema/auth.js';
import { authSessions } from '../schema/auth-sessions.js';
import { auditLog } from '../schema/audit.js';
import { boardAccessRequests, boardMembers } from '../schema/board-access.js';
import { boards } from '../schema/boards.js';
import { emailVerificationTokens } from '../schema/email-verification.js';
import { addedLibraries, libraryItems } from '../schema/library.js';
import { passwordResetTokens } from '../schema/password-reset.js';
import { users, type NewUserRow } from '../schema/users.js';
import { memberships, workspaces } from '../schema/workspaces.js';

/**
 * Deleting an account, in two steps.
 *
 * `requestAccountDeletion` is instant: the account is locked, the boards it
 * owns disappear for everyone, and every session ends. `purgeAccount` erases
 * the data once the grace period is over, run by a scheduled job. Between the
 * two, `cancelAccountDeletion` puts back exactly what the request took away.
 *
 * The account row itself is anonymized rather than deleted. Other people's
 * boards keep the edits this person made there, and those edits name their
 * author by id — so the id stays valid and reads as "Deleted user", and
 * nothing in anybody else's history has to change.
 */

/**
 * How long a request waits before the data is erased. Defined beside the terms
 * in @canvasflow/types, so the editor states the same number this schedules by.
 */
export { ACCOUNT_DELETION_GRACE_DAYS };

/** What an erased account is called wherever something still points at it. */
export const DELETED_USER_NAME = 'Deleted user';

const DAY_MS = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What deletion does to every table that points at an account.
 *
 * The account row survives, so the database's own cascades never fire: every
 * reference has to be dealt with here, and a new one added to the schema must
 * be given a fate before the tests pass.
 *
 * - `deleted`: the account's own sign-in, recovery and access data.
 * - `with-boards`: gone when the boards it owns are deleted.
 * - `kept`: history on other people's boards, left pointing at the anonymized
 *   row so it reads as "Deleted user".
 * - `unlinked`: kept, but no longer says who.
 */
export const USER_REFERENCE_FATES = {
  'auth_sessions.user_id': 'deleted',
  'accounts.user_id': 'deleted',
  'sessions.user_id': 'deleted',
  'email_verification_tokens.user_id': 'deleted',
  'password_reset_tokens.user_id': 'deleted',
  'memberships.user_id': 'deleted',
  'board_members.user_id': 'deleted',
  'board_access_requests.requester_id': 'deleted',
  'library_items.owner_id': 'deleted',
  'added_libraries.owner_id': 'deleted',
  'boards.owner_id': 'with-boards',
  'board_updates.author_id': 'kept',
  'board_versions.author_id': 'kept',
  'board_images.uploaded_by': 'kept',
  'board_share_links.created_by': 'kept',
  'board_members.granted_by': 'kept',
  'board_access_requests.responded_by': 'kept',
  'audit_log.actor_id': 'unlinked',
  'account_deletions.user_id': 'kept',
} as const;

/** The account row's columns that erasure leaves as they are. None of them says who anybody was. */
type KeptAccountColumns = 'id' | 'isGuest' | 'createdAt';

/**
 * The account row after erasure: nothing left that says who it was.
 *
 * Typed against the table, so a column added later cannot be forgotten: it
 * must be wiped here or named in `KeptAccountColumns`, or this stops
 * compiling. The address stays unique, as the column requires, and can never
 * be delivered to — and the real one is free to sign up again.
 */
export function anonymizedAccount(userId: string, now: Date) {
  return {
    email: `deleted-${userId}@deleted.invalid`,
    name: DELETED_USER_NAME,
    avatarUrl: null,
    avatarFileId: null,
    avatarMimeType: null,
    passwordHash: null,
    passwordChangedAt: null,
    emailVerifiedAt: null,
    disabledAt: now,
    termsAcceptedAt: null,
    termsVersion: null,
    preferences: DEFAULT_USER_PREFERENCES,
    updatedAt: now,
    lastSeenAt: null,
  } satisfies Record<Exclude<keyof NewUserRow, KeptAccountColumns>, unknown>;
}

/**
 * The storage prefixes holding an account's files: its uploaded photo, and the
 * images on every board it owns. They mirror the keys the gateway writes —
 * `avatars/<user id>/<file>` and `boards/<board id>/<file>`.
 *
 * Every id is checked before it becomes part of a prefix. A deletion that
 * lists by prefix and is handed an empty or malformed id would be handed
 * `boards/` — every image in the bucket — so this refuses rather than builds.
 */
export function accountStoragePrefixes(userId: string, boardIds: readonly string[]): string[] {
  for (const id of [userId, ...boardIds]) {
    if (!UUID.test(id)) {
      throw new Error(`Refusing to build a storage prefix from ${JSON.stringify(id)}`);
    }
  }
  return [`avatars/${userId}/`, ...boardIds.map((id) => `boards/${id}/`)];
}

/**
 * Workspaces this account owns that somebody else belongs to.
 *
 * Deleting the account deletes the workspaces it owns, and a workspace takes
 * its boards with it — including any that other members own. Nothing lets a
 * second member join a workspace yet, so this is empty for everyone today; it
 * exists so the day that changes, deletion refuses instead of taking other
 * people's work.
 */
async function sharedWorkspacesOf(
  executor: DatabaseExecutor,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const owned = await executor
    .select({ id: workspaces.id, name: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(memberships.userId, userId), eq(memberships.role, 'owner')));
  if (owned.length === 0) return [];

  const others = await executor
    .selectDistinct({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .where(
      and(
        inArray(
          memberships.workspaceId,
          owned.map((workspace) => workspace.id),
        ),
        ne(memberships.userId, userId),
      ),
    );
  const shared = new Set(others.map((row) => row.workspaceId));
  return owned.filter((workspace) => shared.has(workspace.id));
}

export interface AccountDeletionPreview {
  /** Boards the account owns and can see. Ones already in the trash go too. */
  ownedBoards: number;
  /** Owned boards other people are members of: what they will lose. */
  sharedBoards: { id: string; title: string; members: number }[];
  /** Workspaces that stop deletion until somebody else takes them over. */
  sharedWorkspaces: { id: string; name: string }[];
}

/** What deleting the account would take, for the screen that asks. */
export async function accountDeletionPreview(
  db: Database,
  userId: string,
): Promise<AccountDeletionPreview> {
  const [owned] = await db
    .select({ n: count() })
    .from(boards)
    .where(and(eq(boards.ownerId, userId), isNull(boards.deletedAt)));

  const shared = await db
    .select({ id: boards.id, title: boards.title, members: count(boardMembers.id) })
    .from(boards)
    .innerJoin(
      boardMembers,
      and(
        eq(boardMembers.boardId, boards.id),
        ne(boardMembers.userId, userId),
        eq(boardMembers.status, 'active'),
      ),
    )
    .where(and(eq(boards.ownerId, userId), isNull(boards.deletedAt)))
    .groupBy(boards.id, boards.title);

  return {
    ownedBoards: owned?.n ?? 0,
    sharedBoards: shared,
    sharedWorkspaces: await sharedWorkspacesOf(db, userId),
  };
}

export type AccountDeletionRequestOutcome =
  | { ok: true; request: AccountDeletionRow; hiddenBoardIds: string[] }
  | { ok: false; reason: 'no-account' | 'guest' | 'already-scheduled' | 'shared-workspace' };

/**
 * Ask for an account to be deleted.
 *
 * One transaction, all stamped with the same instant: the request is written,
 * the account is locked (sign-in reads `disabledAt`, by password and through a
 * provider alike), the boards it owns are hidden — the access checks and share
 * links already refuse hidden boards — and every session ends. The ids of the
 * hidden boards come back so the caller can close the editors open on them.
 *
 * The account row is locked first, so two requests made at once queue rather
 * than race; the unique index on scheduled requests is the backstop.
 */
export async function requestAccountDeletion(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<AccountDeletionRequestOutcome> {
  try {
    return await db.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: users.id, isGuest: users.isGuest })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!account) return { ok: false, reason: 'no-account' } as const;
      // A guest identity is disposable and has nothing to sign back into.
      if (account.isGuest) return { ok: false, reason: 'guest' } as const;

      const [pending] = await tx
        .select({ id: accountDeletions.id })
        .from(accountDeletions)
        .where(and(eq(accountDeletions.userId, userId), eq(accountDeletions.status, 'scheduled')))
        .limit(1);
      if (pending) return { ok: false, reason: 'already-scheduled' } as const;

      if ((await sharedWorkspacesOf(tx, userId)).length > 0) {
        return { ok: false, reason: 'shared-workspace' } as const;
      }

      const [request] = await tx
        .insert(accountDeletions)
        .values({
          userId,
          requestedAt: now,
          purgeAfter: new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS),
        })
        .returning();
      if (!request) throw new Error('Deletion request was not returned after insert');

      // Only if nothing had locked it already, so a restore can tell the
      // request's lock from one somebody put there for another reason.
      await tx
        .update(users)
        .set({ disabledAt: now, updatedAt: now })
        .where(and(eq(users.id, userId), isNull(users.disabledAt)));

      // Boards already in the trash keep their own date, so a restore leaves
      // them in the trash.
      const hidden = await tx
        .update(boards)
        .set({ deletedAt: now })
        .where(and(eq(boards.ownerId, userId), isNull(boards.deletedAt)))
        .returning({ id: boards.id });

      await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));

      return { ok: true, request, hiddenBoardIds: hidden.map((board) => board.id) } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'already-scheduled' };
    throw error;
  }
}

export type AccountDeletionCancelOutcome =
  | { ok: true; restoredBoardIds: string[] }
  | { ok: false; reason: 'not-scheduled' | 'too-late' };

/**
 * Undo a request inside its grace period — the restore support runs when
 * somebody writes in.
 *
 * Puts back only what carries the request's own timestamp: boards hidden by
 * it, and a lock it placed. Boards the person had already put in the trash,
 * and a lock placed for another reason, stay as they were. Sessions are not
 * restored; the person signs in again.
 *
 * Refused once the grace period is over, even if the purge has not run yet.
 * The purge deletes files before rows, so from that moment an account's
 * images may already be gone, and restoring it would hand back boards with
 * holes in them. The end of the grace period is when deletion becomes final.
 */
export async function cancelAccountDeletion(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<AccountDeletionCancelOutcome> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountDeletions)
      .where(and(eq(accountDeletions.userId, userId), eq(accountDeletions.status, 'scheduled')))
      .for('update');
    if (!request) return { ok: false, reason: 'not-scheduled' } as const;
    if (request.purgeAfter <= now) return { ok: false, reason: 'too-late' } as const;

    const restored = await tx
      .update(boards)
      .set({ deletedAt: null })
      .where(and(eq(boards.ownerId, userId), eq(boards.deletedAt, request.requestedAt)))
      .returning({ id: boards.id });

    await tx
      .update(users)
      .set({ disabledAt: null, updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.disabledAt, request.requestedAt)));

    await tx
      .update(accountDeletions)
      .set({ status: 'cancelled', cancelledAt: now })
      .where(eq(accountDeletions.id, request.id));

    // In the same transaction, so a restore and its record cannot part. No
    // actor: support did this, and support is not an account.
    await tx.insert(auditLog).values({
      workspaceId: null,
      actorId: null,
      action: 'auth.account.deletion_cancelled',
      targetType: 'user',
      targetId: userId,
      metadata: { requestId: request.id, restoredBoards: restored.length },
    });

    return { ok: true, restoredBoardIds: restored.map((board) => board.id) } as const;
  });
}

/** Requests whose grace period is over, oldest first: the purge job's work list. */
export async function dueAccountDeletions(
  db: Database,
  now: Date = new Date(),
): Promise<AccountDeletionRow[]> {
  return db
    .select()
    .from(accountDeletions)
    .where(and(eq(accountDeletions.status, 'scheduled'), lte(accountDeletions.purgeAfter, now)))
    .orderBy(accountDeletions.purgeAfter);
}

/**
 * The storage prefixes a request's files live under — every board the account
 * owns, trashed ones included, and its photo.
 *
 * Read before `purgeAccount`, which deletes the rows this is worked out from.
 * The files go first for that reason: if the job stops between the two, the
 * next run reads the same list again and finishes.
 */
export async function accountDeletionStorage(
  db: Database,
  request: Pick<AccountDeletionRow, 'userId'>,
): Promise<string[]> {
  const owned = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.ownerId, request.userId));
  return accountStoragePrefixes(
    request.userId,
    owned.map((board) => board.id),
  );
}

/** Workspaces the account owns, whoever else is in them. */
async function ownedWorkspaceIds(executor: DatabaseExecutor, userId: string): Promise<string[]> {
  const rows = await executor
    .select({ id: memberships.workspaceId })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.role, 'owner')));
  return rows.map((row) => row.id);
}

/**
 * Why an account cannot be erased, or null when nothing stands in the way.
 *
 * Erasing an account deletes the workspaces it owns, and a workspace takes
 * everything in it along — so it must not own one that somebody else belongs
 * to, or one holding a board somebody else owns. Neither can happen today,
 * since nothing lets a second member join a workspace, which is exactly why it
 * is checked rather than assumed.
 *
 * The purge job asks this before it deletes any files, and `purgeAccount` asks
 * again under its lock, so nothing irreversible starts on an account that
 * would then be refused halfway through.
 */
export async function purgeBlocker(
  executor: DatabaseExecutor,
  userId: string,
): Promise<string | null> {
  if ((await sharedWorkspacesOf(executor, userId)).length > 0) {
    return 'owns a workspace other people belong to';
  }
  const owned = await ownedWorkspaceIds(executor, userId);
  if (owned.length > 0) {
    const [others] = await executor
      .select({ n: count() })
      .from(boards)
      .where(and(inArray(boards.workspaceId, owned), ne(boards.ownerId, userId)));
    if ((others?.n ?? 0) > 0) return "owns a workspace holding other people's boards";
  }
  return null;
}

export type AccountPurgeOutcome =
  | { ok: true; deletedBoardIds: string[] }
  | { ok: false; reason: 'not-scheduled' | 'not-due' };

/**
 * Erase an account whose grace period is over. The files must already be gone
 * — see `accountDeletionStorage`.
 *
 * One transaction: the boards it owns (and everything hanging off them), the
 * workspaces it owns, its access to other people's boards, its sign-in and
 * recovery data; its security log entries lose its name; the account row is
 * anonymized; the security log records the erasure; the request becomes the
 * receipt. Re-checks everything, so it is safe to run twice or on a request
 * that was cancelled a moment ago.
 */
export async function purgeAccount(
  db: Database,
  requestId: string,
  now: Date = new Date(),
): Promise<AccountPurgeOutcome> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountDeletions)
      .where(eq(accountDeletions.id, requestId))
      .for('update');
    if (!request || request.status !== 'scheduled') {
      return { ok: false, reason: 'not-scheduled' } as const;
    }
    if (request.purgeAfter > now) return { ok: false, reason: 'not-due' } as const;

    const { userId } = request;

    // Refused at request time and checked by the job before any files went;
    // checked once more here, under the lock, in case something changed since.
    const blocker = await purgeBlocker(tx, userId);
    if (blocker) throw new Error(`Refusing to purge ${request.id}: the account ${blocker}`);

    const deleted = await tx
      .delete(boards)
      .where(eq(boards.ownerId, userId))
      .returning({ id: boards.id });

    const ownedWorkspaces = await ownedWorkspaceIds(tx, userId);

    if (ownedWorkspaces.length > 0) {
      // A workspace takes its boards with it, so anything still in one now
      // belongs to somebody else. Stop rather than delete it.
      const [remaining] = await tx
        .select({ n: count() })
        .from(boards)
        .where(inArray(boards.workspaceId, ownedWorkspaces));
      if ((remaining?.n ?? 0) > 0) {
        throw new Error(
          `Refusing to purge ${request.id}: the account owns a workspace holding other people's boards`,
        );
      }

      // The security log is kept for a year whatever happens to the account,
      // and deleting the workspace would take its entries with it.
      await tx
        .update(auditLog)
        .set({ workspaceId: null })
        .where(inArray(auditLog.workspaceId, ownedWorkspaces));
      await tx.delete(workspaces).where(inArray(workspaces.id, ownedWorkspaces));
    }

    await tx.delete(memberships).where(eq(memberships.userId, userId));
    await tx.delete(boardMembers).where(eq(boardMembers.userId, userId));
    await tx.delete(boardAccessRequests).where(eq(boardAccessRequests.requesterId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    // Their refresh tokens go with them.
    await tx.delete(authSessions).where(eq(authSessions.userId, userId));
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    // Their library is theirs alone, so it goes with the rest of them.
    await tx.delete(libraryItems).where(eq(libraryItems.ownerId, userId));
    await tx.delete(addedLibraries).where(eq(addedLibraries.ownerId, userId));

    await tx.update(auditLog).set({ actorId: null }).where(eq(auditLog.actorId, userId));

    await tx.update(users).set(anonymizedAccount(userId, now)).where(eq(users.id, userId));

    // No actor: nobody acted, the grace period ran out. The target is the row
    // that now reads "Deleted user", so this says nothing about who it was.
    await tx.insert(auditLog).values({
      workspaceId: null,
      actorId: null,
      action: 'auth.account.deleted',
      targetType: 'user',
      targetId: userId,
      metadata: { requestId: request.id, boards: deleted.length },
    });

    await tx
      .update(accountDeletions)
      .set({ status: 'completed', completedAt: now })
      .where(eq(accountDeletions.id, request.id));

    return { ok: true, deletedBoardIds: deleted.map((board) => board.id) } as const;
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
