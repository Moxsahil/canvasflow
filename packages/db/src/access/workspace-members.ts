import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { can, canManageMember } from '@canvasflow/types';
import type { Database } from '../client.js';
import { auditLog } from '../schema/audit.js';
import { boardMembers } from '../schema/board-access.js';
import { boards } from '../schema/boards.js';
import { memberships, workspaces } from '../schema/workspaces.js';
import type { WorkspaceRole } from './workspaces.js';

/**
 * Running who is in a workspace: changing someone between member and admin,
 * removing them, leaving, and handing the ownership over.
 *
 * Every change here starts by locking the workspace's row, so two of them on
 * the same workspace happen one after the other: an owner handing over while
 * an admin removes the person they are handing to, say, cannot both succeed.
 * The caller's role is read again under that lock rather than trusted from
 * the route, for the same reason.
 *
 * A workspace has one owner, always. Nothing here changes who it is except
 * the person offered the ownership accepting it.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** A role an admin can give: never owner, which moves only by being handed over. */
export type AssignableRole = Exclude<WorkspaceRole, 'owner'>;

export function isAssignableRole(value: unknown): value is AssignableRole {
  return value === 'member' || value === 'admin';
}

type Refusal =
  | 'workspace-gone'
  /** The caller is not in the workspace, or their role does not allow it. */
  | 'not-allowed'
  /** The person acted on is not in the workspace. */
  | 'not-member'
  /** The person acted on is the owner, whose standing only moves by handing it over. */
  | 'owner'
  /** One's own standing is changed by leaving, or by another admin. */
  | 'self';

async function lockWorkspace(tx: Tx, workspaceId: string) {
  const [row] = await tx
    .select({ id: workspaces.id, ownershipOfferedTo: workspaces.ownershipOfferedTo })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
    .for('update');
  return row ?? null;
}

async function roleIn(tx: Tx, workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const [row] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

async function ownerOf(tx: Tx, workspaceId: string): Promise<string | null> {
  const [row] = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, 'owner')))
    .limit(1);
  return row?.userId ?? null;
}

/** Checks shared by changing a role and removing: who may act on whom. */
async function checkManage(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  userId: string,
): Promise<Refusal | null> {
  if (actorId === userId) return 'self';
  const actor = await roleIn(tx, workspaceId, actorId);
  if (!actor || !can(actor, 'manage-members')) return 'not-allowed';
  const target = await roleIn(tx, workspaceId, userId);
  if (!target) return 'not-member';
  if (!canManageMember(actor, target)) return 'owner';
  return null;
}

export type ChangeRoleOutcome = { ok: true; changed: boolean } | { ok: false; reason: Refusal };

/** Make someone a member or an admin. */
export async function changeMemberRole(
  db: Database,
  input: { workspaceId: string; actorId: string; userId: string; role: AssignableRole },
): Promise<ChangeRoleOutcome> {
  return db.transaction(async (tx) => {
    if (!(await lockWorkspace(tx, input.workspaceId))) {
      return { ok: false, reason: 'workspace-gone' } as const;
    }
    const refusal = await checkManage(tx, input.workspaceId, input.actorId, input.userId);
    if (refusal) return { ok: false, reason: refusal } as const;

    const before = await roleIn(tx, input.workspaceId, input.userId);
    if (before === input.role) return { ok: true, changed: false } as const;

    await tx
      .update(memberships)
      .set({ role: input.role })
      .where(
        and(eq(memberships.workspaceId, input.workspaceId), eq(memberships.userId, input.userId)),
      );

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'workspace.member.role.changed',
      targetType: 'user',
      targetId: input.userId,
      metadata: { from: before, to: input.role },
    });
    return { ok: true, changed: true } as const;
  });
}

/** What happened to somebody's place in a workspace as they went. */
export interface Departure {
  /** Who the boards they owned in it now belong to: the workspace's owner. */
  ownerId: string;
  /** How many of their boards passed to the owner. */
  boardsPassed: number;
  /** Every board in the workspace, so open connections to them can be re-checked at once. */
  boardIds: string[];
}

/**
 * What leaving and being removed both do: out of the workspace, their boards
 * to its owner, and any offer of the ownership to them withdrawn. Their
 * drawings stay on the boards, as anyone's do.
 */
async function depart(
  tx: Tx,
  workspaceId: string,
  userId: string,
  offeredTo: string | null,
): Promise<Departure | null> {
  const ownerId = await ownerOf(tx, workspaceId);
  if (!ownerId) return null;

  await tx
    .delete(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));

  // Deleted boards too, so restoring one gives it back to somebody still here.
  const passed = await tx
    .update(boards)
    .set({ ownerId })
    .where(and(eq(boards.workspaceId, workspaceId), eq(boards.ownerId, userId)))
    .returning({ id: boards.id });

  if (offeredTo === userId) {
    await tx
      .update(workspaces)
      .set({ ownershipOfferedTo: null, ownershipOfferedAt: null })
      .where(eq(workspaces.id, workspaceId));
  }

  const live = await tx
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt)));

  return { ownerId, boardsPassed: passed.length, boardIds: live.map((board) => board.id) };
}

export type DepartureOutcome = ({ ok: true } & Departure) | { ok: false; reason: Refusal };

/**
 * Take somebody out of a workspace. They lose it and every board in it at once.
 *
 * Every board in it gets a revoked grant for them, which is what keeps them
 * out: a revoked grant outranks everything but owning the board, and no share
 * link lets a person back past one — only a board's owner adding them back,
 * or the workspace inviting them in again, does.
 */
export async function removeMember(
  db: Database,
  input: { workspaceId: string; actorId: string; userId: string },
): Promise<DepartureOutcome> {
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, input.workspaceId);
    if (!workspace) return { ok: false, reason: 'workspace-gone' } as const;
    const refusal = await checkManage(tx, input.workspaceId, input.actorId, input.userId);
    if (refusal) return { ok: false, reason: refusal } as const;

    const departed = await depart(
      tx,
      input.workspaceId,
      input.userId,
      workspace.ownershipOfferedTo,
    );
    if (!departed) return { ok: false, reason: 'workspace-gone' } as const;

    if (departed.boardIds.length > 0) {
      const now = new Date();
      await tx
        .insert(boardMembers)
        .values(
          departed.boardIds.map((boardId) => ({
            boardId,
            userId: input.userId,
            status: 'revoked' as const,
            grantedBy: input.actorId,
          })),
        )
        .onConflictDoUpdate({
          target: [boardMembers.boardId, boardMembers.userId],
          set: { status: 'revoked', updatedAt: now },
        });
    }

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'workspace.member.removed',
      targetType: 'user',
      targetId: input.userId,
      metadata: { boardsPassed: departed.boardsPassed, boardsTo: departed.ownerId },
    });

    return { ok: true, ...departed } as const;
  });
}

/**
 * Leave a workspace. Anyone but the owner may; the owner hands the ownership
 * over first, and can leave once somebody has accepted it.
 *
 * Unlike a removal this shuts no door: their grants on its boards go, but a
 * share link someone sends them later works as it would for anyone.
 */
export async function leaveWorkspace(
  db: Database,
  input: { workspaceId: string; userId: string },
): Promise<DepartureOutcome> {
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, input.workspaceId);
    if (!workspace) return { ok: false, reason: 'workspace-gone' } as const;
    const role = await roleIn(tx, input.workspaceId, input.userId);
    if (!role) return { ok: false, reason: 'not-member' } as const;
    if (!can(role, 'leave')) return { ok: false, reason: 'owner' } as const;

    const departed = await depart(
      tx,
      input.workspaceId,
      input.userId,
      workspace.ownershipOfferedTo,
    );
    if (!departed) return { ok: false, reason: 'workspace-gone' } as const;

    if (departed.boardIds.length > 0) {
      await tx
        .delete(boardMembers)
        .where(
          and(
            eq(boardMembers.userId, input.userId),
            eq(boardMembers.status, 'active'),
            inArray(boardMembers.boardId, departed.boardIds),
          ),
        );
    }

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.userId,
      action: 'workspace.member.left',
      targetType: 'user',
      targetId: input.userId,
      metadata: { boardsPassed: departed.boardsPassed, boardsTo: departed.ownerId },
    });

    return { ok: true, ...departed } as const;
  });
}

/** An offer of the ownership waiting for an answer. */
export interface OwnershipOffer {
  toUserId: string;
  offeredAt: Date;
}

export async function ownershipOfferOf(
  db: Database,
  workspaceId: string,
): Promise<OwnershipOffer | null> {
  const [row] = await db
    .select({ to: workspaces.ownershipOfferedTo, at: workspaces.ownershipOfferedAt })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row?.to && row.at ? { toUserId: row.to, offeredAt: row.at } : null;
}

export type OfferOutcome = { ok: true } | { ok: false; reason: Refusal };

/**
 * Offer the ownership to another member. Replaces any offer already out.
 * Nothing changes hands until they accept.
 */
export async function offerOwnership(
  db: Database,
  input: { workspaceId: string; ownerId: string; toUserId: string },
): Promise<OfferOutcome> {
  return db.transaction(async (tx) => {
    if (!(await lockWorkspace(tx, input.workspaceId))) {
      return { ok: false, reason: 'workspace-gone' } as const;
    }
    if (input.ownerId === input.toUserId) return { ok: false, reason: 'self' } as const;
    const role = await roleIn(tx, input.workspaceId, input.ownerId);
    if (!role || !can(role, 'hand-over')) return { ok: false, reason: 'not-allowed' } as const;
    if (!(await roleIn(tx, input.workspaceId, input.toUserId))) {
      return { ok: false, reason: 'not-member' } as const;
    }

    await tx
      .update(workspaces)
      .set({ ownershipOfferedTo: input.toUserId, ownershipOfferedAt: new Date() })
      .where(eq(workspaces.id, input.workspaceId));

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.ownerId,
      action: 'workspace.ownership.offered',
      targetType: 'user',
      targetId: input.toUserId,
    });
    return { ok: true } as const;
  });
}

export type WithdrawOutcome =
  | { ok: true; offeredTo: string }
  | { ok: false; reason: 'workspace-gone' | 'no-offer' | 'not-allowed' };

/**
 * Take an offer back — the owner — or turn it down — the person offered it.
 * Nobody else may.
 */
export async function withdrawOwnershipOffer(
  db: Database,
  input: { workspaceId: string; actorId: string },
): Promise<WithdrawOutcome> {
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, input.workspaceId);
    if (!workspace) return { ok: false, reason: 'workspace-gone' } as const;
    const offeredTo = workspace.ownershipOfferedTo;
    if (!offeredTo) return { ok: false, reason: 'no-offer' } as const;

    const owner = await ownerOf(tx, input.workspaceId);
    if (input.actorId !== owner && input.actorId !== offeredTo) {
      return { ok: false, reason: 'not-allowed' } as const;
    }

    await tx
      .update(workspaces)
      .set({ ownershipOfferedTo: null, ownershipOfferedAt: null })
      .where(eq(workspaces.id, input.workspaceId));

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'workspace.ownership.offer_withdrawn',
      targetType: 'user',
      targetId: offeredTo,
      metadata: { by: input.actorId === offeredTo ? 'declined' : 'withdrawn' },
    });
    return { ok: true, offeredTo } as const;
  });
}

export type AcceptOwnershipOutcome =
  | { ok: true; previousOwnerId: string }
  | { ok: false; reason: 'workspace-gone' | 'no-offer' };

/**
 * Accept the ownership one was offered. The previous owner becomes an admin,
 * and — no longer the owner — may now leave.
 */
export async function acceptOwnership(
  db: Database,
  input: { workspaceId: string; userId: string },
): Promise<AcceptOwnershipOutcome> {
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, input.workspaceId);
    if (!workspace) return { ok: false, reason: 'workspace-gone' } as const;
    if (workspace.ownershipOfferedTo !== input.userId) {
      return { ok: false, reason: 'no-offer' } as const;
    }
    const owner = await ownerOf(tx, input.workspaceId);
    if (!owner || !(await roleIn(tx, input.workspaceId, input.userId))) {
      return { ok: false, reason: 'no-offer' } as const;
    }

    await tx
      .update(memberships)
      .set({ role: 'admin' })
      .where(and(eq(memberships.workspaceId, input.workspaceId), eq(memberships.userId, owner)));
    await tx
      .update(memberships)
      .set({ role: 'owner' })
      .where(
        and(eq(memberships.workspaceId, input.workspaceId), eq(memberships.userId, input.userId)),
      );
    await tx
      .update(workspaces)
      .set({ ownershipOfferedTo: null, ownershipOfferedAt: null, updatedAt: new Date() })
      .where(eq(workspaces.id, input.workspaceId));

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.userId,
      action: 'workspace.ownership.transferred',
      targetType: 'user',
      targetId: input.userId,
      metadata: { from: owner },
    });
    return { ok: true, previousOwnerId: owner } as const;
  });
}

/** What a guest may do on a board: the two roles a share link hands out. */
export type GuestRole = 'editor' | 'viewer';

export function isGuestRole(value: unknown): value is GuestRole {
  return value === 'editor' || value === 'viewer';
}

export type GuestChangeOutcome =
  | { ok: true; boardIds: string[] }
  | { ok: false; reason: 'workspace-gone' | 'not-allowed' | 'not-guest' };

/** As for any change to a guest, and which of their boards it actually changed. */
export type GuestRoleOutcome =
  | (Extract<GuestChangeOutcome, { ok: true }> & { changedBoardIds: string[] })
  | Extract<GuestChangeOutcome, { ok: false }>;

/**
 * The boards in this workspace a guest is on: standing grants on boards not
 * deleted, and not their own — the same rows the member list counts them by.
 */
async function guestGrants(tx: Tx, workspaceId: string, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ boardId: boardMembers.boardId })
    .from(boardMembers)
    .innerJoin(boards, eq(boards.id, boardMembers.boardId))
    .where(
      and(
        eq(boards.workspaceId, workspaceId),
        isNull(boards.deletedAt),
        ne(boards.ownerId, userId),
        eq(boardMembers.userId, userId),
        eq(boardMembers.status, 'active'),
      ),
    );
  return rows.map((row) => row.boardId);
}

/**
 * Checks shared by changing and removing a guest: someone who runs the
 * workspace acting on someone outside it. A member is managed as a member,
 * never as a guest, even where they also hold a grant on a board.
 */
async function guestBoardsToManage(
  tx: Tx,
  input: { workspaceId: string; actorId: string; userId: string },
): Promise<string[] | Extract<GuestChangeOutcome, { ok: false }>['reason']> {
  if (!(await lockWorkspace(tx, input.workspaceId))) return 'workspace-gone';
  const actor = await roleIn(tx, input.workspaceId, input.actorId);
  if (!actor || !can(actor, 'manage-members')) return 'not-allowed';
  if (await roleIn(tx, input.workspaceId, input.userId)) return 'not-guest';
  const boardIds = await guestGrants(tx, input.workspaceId, input.userId);
  return boardIds.length > 0 ? boardIds : 'not-guest';
}

/**
 * Set what a guest may do on every board of this workspace they are on —
 * from the member list, where whoever runs the workspace sees all its guests
 * at once rather than one board's at a time.
 */
export async function setGuestRole(
  db: Database,
  input: { workspaceId: string; actorId: string; userId: string; role: GuestRole },
): Promise<GuestRoleOutcome> {
  return db.transaction(async (tx) => {
    const found = await guestBoardsToManage(tx, input);
    if (typeof found === 'string') return { ok: false, reason: found } as const;

    const changed = await tx
      .update(boardMembers)
      .set({ role: input.role, updatedAt: new Date() })
      .where(
        and(
          eq(boardMembers.userId, input.userId),
          inArray(boardMembers.boardId, found),
          ne(boardMembers.role, input.role),
        ),
      )
      .returning({ boardId: boardMembers.boardId });

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'workspace.guest.role.changed',
      targetType: 'user',
      targetId: input.userId,
      metadata: { role: input.role, boards: found.length },
    });
    return {
      ok: true,
      boardIds: found,
      changedBoardIds: changed.map((row) => row.boardId),
    } as const;
  });
}

/**
 * Take a guest off every board of this workspace they are on, at once.
 *
 * Revoked rather than deleted, as removing someone from one board's Share
 * window does: no share link lets them back, and each board's owner can still
 * add them back from there.
 */
export async function removeGuest(
  db: Database,
  input: { workspaceId: string; actorId: string; userId: string },
): Promise<GuestChangeOutcome> {
  return db.transaction(async (tx) => {
    const found = await guestBoardsToManage(tx, input);
    if (typeof found === 'string') return { ok: false, reason: found } as const;

    await tx
      .update(boardMembers)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(and(eq(boardMembers.userId, input.userId), inArray(boardMembers.boardId, found)));

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'workspace.guest.removed',
      targetType: 'user',
      targetId: input.userId,
      metadata: { boards: found.length },
    });
    return { ok: true, boardIds: found } as const;
  });
}
