import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boards } from '../schema/boards.js';
import { users } from '../schema/users.js';
import {
  boardAccessRequests,
  boardMembers,
  type BoardAccessRequestRow,
  type BoardRole,
} from '../schema/board-access.js';
import { resolveBoardAccess } from './board-access.js';

export interface AccessRequestWithRequester {
  id: string;
  boardId: string;
  status: BoardAccessRequestRow['status'];
  requestedRole: BoardRole;
  createdAt: Date;
  requester: { id: string; name: string | null; email: string };
}

export type RequestAccessOutcome =
  | { kind: 'board-not-found' }
  | { kind: 'already-has-access'; role: BoardRole }
  | { kind: 'pending'; request: BoardAccessRequestRow };

/**
 * Ask the board's owner for access.
 *
 * Creating a request grants nothing — it only records that someone asked.
 * Authorization still comes solely from resolveBoardAccess, so a pending
 * (or rejected) request can never be mistaken for permission.
 *
 * Idempotent: asking twice returns the existing pending request rather
 * than piling up duplicates in the owner's inbox.
 */
export async function requestBoardAccess(
  db: Database,
  requesterId: string,
  boardId: string,
  requestedRole: BoardRole = 'editor',
): Promise<RequestAccessOutcome> {
  const boardRows = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!boardRows[0]) return { kind: 'board-not-found' };

  const existingAccess = await resolveBoardAccess(db, requesterId, boardId);
  if (existingAccess) {
    return { kind: 'already-has-access', role: existingAccess.role };
  }

  const pending = await db
    .select()
    .from(boardAccessRequests)
    .where(
      and(
        eq(boardAccessRequests.boardId, boardId),
        eq(boardAccessRequests.requesterId, requesterId),
        eq(boardAccessRequests.status, 'pending'),
      ),
    )
    .limit(1);
  if (pending[0]) return { kind: 'pending', request: pending[0] };

  const inserted = await db
    .insert(boardAccessRequests)
    .values({ boardId, requesterId, requestedRole })
    .returning();

  const request = inserted[0];
  if (!request) throw new Error('Failed to create access request');
  return { kind: 'pending', request };
}

/** The owner's inbox: who is waiting on a decision for this board. */
export async function listPendingAccessRequests(
  db: Database,
  boardId: string,
): Promise<AccessRequestWithRequester[]> {
  const rows = await db
    .select({
      id: boardAccessRequests.id,
      boardId: boardAccessRequests.boardId,
      status: boardAccessRequests.status,
      requestedRole: boardAccessRequests.requestedRole,
      createdAt: boardAccessRequests.createdAt,
      requesterId: users.id,
      requesterName: users.name,
      requesterEmail: users.email,
    })
    .from(boardAccessRequests)
    .innerJoin(users, eq(users.id, boardAccessRequests.requesterId))
    .where(and(eq(boardAccessRequests.boardId, boardId), eq(boardAccessRequests.status, 'pending')))
    .orderBy(desc(boardAccessRequests.createdAt));

  return rows.map((r) => ({
    id: r.id,
    boardId: r.boardId,
    status: r.status,
    requestedRole: r.requestedRole,
    createdAt: r.createdAt,
    requester: { id: r.requesterId, name: r.requesterName, email: r.requesterEmail },
  }));
}

/** What the current user's own request looks like, for rendering "pending…" state. */
export async function getMyAccessRequest(
  db: Database,
  requesterId: string,
  boardId: string,
): Promise<BoardAccessRequestRow | null> {
  const rows = await db
    .select()
    .from(boardAccessRequests)
    .where(
      and(
        eq(boardAccessRequests.boardId, boardId),
        eq(boardAccessRequests.requesterId, requesterId),
      ),
    )
    .orderBy(desc(boardAccessRequests.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Approve a pending request: mark it approved AND create/reactivate the
 * membership that actually grants access.
 *
 * Both writes happen in one transaction — an approved request with no
 * corresponding membership row would be a request that looks granted but
 * authorizes nothing, and the inverse would grant access with no record
 * of why.
 *
 * `grantRole` lets the owner approve at a lower privilege than requested
 * (e.g. someone asks to edit, owner grants view-only).
 */
export async function approveAccessRequest(
  db: Database,
  requestId: string,
  approverId: string,
  grantRole?: BoardRole,
): Promise<{ ok: boolean; boardId?: string; userId?: string }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(boardAccessRequests)
      .where(eq(boardAccessRequests.id, requestId))
      .limit(1);

    const request = rows[0];
    if (!request || request.status !== 'pending') return { ok: false };

    const role = grantRole ?? request.requestedRole;

    await tx
      .update(boardAccessRequests)
      .set({ status: 'approved', respondedBy: approverId, respondedAt: new Date() })
      .where(eq(boardAccessRequests.id, requestId));

    // onConflictDoUpdate rather than insert: the user may have been a
    // member before and had access revoked, in which case the row already
    // exists and must be flipped back to active.
    await tx
      .insert(boardMembers)
      .values({
        boardId: request.boardId,
        userId: request.requesterId,
        role,
        status: 'active',
        grantedBy: approverId,
      })
      .onConflictDoUpdate({
        target: [boardMembers.boardId, boardMembers.userId],
        set: { role, status: 'active', grantedBy: approverId, updatedAt: new Date() },
      });

    return { ok: true, boardId: request.boardId, userId: request.requesterId };
  });
}

export async function rejectAccessRequest(
  db: Database,
  requestId: string,
  responderId: string,
): Promise<boolean> {
  const rows = await db
    .select({ status: boardAccessRequests.status })
    .from(boardAccessRequests)
    .where(eq(boardAccessRequests.id, requestId))
    .limit(1);
  if (!rows[0] || rows[0].status !== 'pending') return false;

  await db
    .update(boardAccessRequests)
    .set({ status: 'rejected', respondedBy: responderId, respondedAt: new Date() })
    .where(eq(boardAccessRequests.id, requestId));
  return true;
}

/**
 * Revoke a user's access to a board.
 *
 * Writes a `revoked` membership row rather than deleting one, because
 * resolveBoardAccess treats an explicit revocation as outranking the
 * workspace-wide fallback. Deleting the row would silently hand access
 * straight back to any revoked user who is also in the workspace.
 *
 * The board's owner cannot be revoked — that would orphan the board.
 */
export async function revokeBoardAccess(
  db: Database,
  boardId: string,
  userId: string,
  revokedBy: string,
): Promise<{ ok: boolean; reason?: string }> {
  const boardRows = await db
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);

  const board = boardRows[0];
  if (!board) return { ok: false, reason: 'board-not-found' };
  if (board.ownerId === userId) return { ok: false, reason: 'cannot-revoke-owner' };

  await db
    .insert(boardMembers)
    .values({ boardId, userId, role: 'viewer', status: 'revoked', grantedBy: revokedBy })
    .onConflictDoUpdate({
      target: [boardMembers.boardId, boardMembers.userId],
      set: { status: 'revoked', updatedAt: new Date() },
    });

  return { ok: true };
}

export async function listBoardMembers(db: Database, boardId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: boardMembers.role,
      status: boardMembers.status,
    })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(eq(boardMembers.boardId, boardId));
}
