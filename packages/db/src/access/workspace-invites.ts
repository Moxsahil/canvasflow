import { createHash, randomBytes } from 'node:crypto';
import { and, count, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { auditLog } from '../schema/audit.js';
import { users } from '../schema/users.js';
import { memberships, workspaces } from '../schema/workspaces.js';
import { workspaceInvites, type WorkspaceInviteRow } from '../schema/workspace-invites.js';
import type { WorkspaceRole } from './workspaces.js';

/**
 * Inviting somebody into a workspace by email, and their accepting it.
 *
 * Who may invite is the caller's question — the gateway asks `workspaceRoleOf`
 * first, as it does for everything else in a workspace. What lives here is
 * what has to hold whoever asks: one open invitation per address, tokens that
 * are only ever stored hashed, and an acceptance that only the invited address
 * can make, once.
 */

/** How long a link in an invitation works. Sending it again starts the week over. */
export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** How soon the same invitation may be sent again. Stops a double click mailing twice. */
export const INVITE_RESEND_COOLDOWN_MS = 60 * 1000;

/** Open invitations one workspace may have at once. Far past any real team; a ceiling on abuse. */
export const MAX_PENDING_INVITES = 100;

/** 256 bits, as share links and password resets have: the token is the whole credential. */
const TOKEN_BYTES = 32;

/** The longest address SMTP will carry. */
const MAX_EMAIL_LENGTH = 254;

/** Who an invitation can make somebody. A workspace's one owner hands over; nobody is sent it. */
export type InvitableRole = Exclude<WorkspaceRole, 'owner'>;

export function isInvitableRole(value: unknown): value is InvitableRole {
  return value === 'member' || value === 'admin';
}

export type ParsedInviteEmail = { ok: true; email: string } | { ok: false; error: string };

/**
 * An address as it is stored and compared: trimmed and lower-cased, as account
 * addresses are at signup, so "Sam@Example.com" and "sam@example.com" are the
 * same invitation and the same person.
 *
 * Only a plausibility check. Whether the address takes mail is something only
 * sending to it can say.
 */
export function parseInviteEmail(raw: unknown): ParsedInviteEmail {
  if (typeof raw !== 'string') return { ok: false, error: 'Enter an email address.' };
  const email = raw.trim().toLowerCase();
  if (!email) return { ok: false, error: 'Enter an email address.' };
  if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'That doesn’t look like an email address.' };
  }
  return { ok: true, email };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** An invitation nobody has answered yet, as the Members window lists it. */
export interface PendingInvite {
  id: string;
  email: string;
  role: InvitableRole;
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
  lastSentAt: Date;
  /** Its link has stopped working. Still listed, so it can be sent again or taken back. */
  expired: boolean;
}

function toPendingInvite(
  row: Pick<WorkspaceInviteRow, 'id' | 'email' | 'role' | 'createdAt' | 'expiresAt' | 'lastSentAt'>,
  invitedByName: string,
  now: Date,
): PendingInvite {
  return {
    id: row.id,
    email: row.email,
    // The check constraint keeps owner out of the column.
    role: row.role as InvitableRole,
    invitedByName,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastSentAt: row.lastSentAt,
    expired: row.expiresAt.getTime() <= now.getTime(),
  };
}

const PENDING = and(isNull(workspaceInvites.acceptedAt), isNull(workspaceInvites.revokedAt));

/** Every invitation in this workspace still waiting for an answer, newest first. */
export async function listPendingInvites(
  db: Database,
  workspaceId: string,
  now: Date = new Date(),
): Promise<PendingInvite[]> {
  const rows = await db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      createdAt: workspaceInvites.createdAt,
      expiresAt: workspaceInvites.expiresAt,
      lastSentAt: workspaceInvites.lastSentAt,
      invitedByName: users.name,
    })
    .from(workspaceInvites)
    .innerJoin(users, eq(users.id, workspaceInvites.invitedBy))
    .where(and(eq(workspaceInvites.workspaceId, workspaceId), PENDING))
    .orderBy(desc(workspaceInvites.createdAt));

  return rows.map(({ invitedByName, ...row }) => toPendingInvite(row, invitedByName, now));
}

export interface CreateInviteInput {
  workspaceId: string;
  email: string;
  role: InvitableRole;
  invitedBy: string;
  now?: Date;
}

export type CreateInviteOutcome =
  | { ok: true; invite: PendingInvite; token: string }
  | {
      ok: false;
      reason: 'workspace-gone' | 'already-member' | 'already-invited' | 'too-many';
    };

/**
 * Invite an address into a workspace. Returns the plaintext token once, for
 * the email; only its hash is kept.
 *
 * An address that already has an open invitation is refused rather than sent
 * a second one: the person sending it is offered "send again" instead, which
 * replaces the old link rather than leaving two working.
 */
export async function createWorkspaceInvite(
  db: Database,
  input: CreateInviteInput,
): Promise<CreateInviteOutcome> {
  const now = input.now ?? new Date();
  const token = newToken();

  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.deletedAt)))
      .limit(1);
    if (!workspace) return { ok: false, reason: 'workspace-gone' } as const;

    const [member] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.workspaceId, input.workspaceId),
          sql`lower(${users.email}) = ${input.email}`,
        ),
      )
      .limit(1);
    if (member) return { ok: false, reason: 'already-member' } as const;

    const [pending] = await tx
      .select({ n: count() })
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.workspaceId, input.workspaceId), PENDING));
    if ((pending?.n ?? 0) >= MAX_PENDING_INVITES) {
      return { ok: false, reason: 'too-many' } as const;
    }

    // The partial unique index decides a race between two people inviting the
    // same address: the loser inserts nothing.
    const [row] = await tx
      .insert(workspaceInvites)
      .values({
        workspaceId: input.workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedBy: input.invitedBy,
        createdAt: now,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS),
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return { ok: false, reason: 'already-invited' } as const;

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.invitedBy,
      action: 'workspace.member.invited',
      targetType: 'invite',
      targetId: row.id,
      metadata: { role: input.role },
    });

    const [inviter] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, input.invitedBy))
      .limit(1);

    return { ok: true, invite: toPendingInvite(row, inviter?.name ?? '', now), token } as const;
  });
}

export type ResendInviteOutcome =
  | { ok: true; invite: PendingInvite; token: string }
  | { ok: false; reason: 'not-found' | 'too-soon' };

/**
 * Send an invitation again: a new token, and a fresh week from now.
 *
 * The old token stops working with this, so only the newest email's link
 * opens anything — the way to take back a link sent to a wrong inbox short of
 * revoking the invitation outright.
 */
export async function resendWorkspaceInvite(
  db: Database,
  input: { workspaceId: string; inviteId: string; actorId: string; now?: Date },
): Promise<ResendInviteOutcome> {
  const now = input.now ?? new Date();
  const token = newToken();

  return db.transaction(async (tx) => {
    const scope = and(
      eq(workspaceInvites.id, input.inviteId),
      // Scoped to the workspace the caller was authorized for, so an id from
      // another one answers as missing.
      eq(workspaceInvites.workspaceId, input.workspaceId),
      PENDING,
    );

    const [row] = await tx
      .update(workspaceInvites)
      .set({
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS),
        lastSentAt: now,
        sendCount: sql`${workspaceInvites.sendCount} + 1`,
      })
      .where(
        and(
          scope,
          lte(workspaceInvites.lastSentAt, new Date(now.getTime() - INVITE_RESEND_COOLDOWN_MS)),
        ),
      )
      .returning();

    if (!row) {
      const [exists] = await tx
        .select({ id: workspaceInvites.id })
        .from(workspaceInvites)
        .where(scope)
        .limit(1);
      return { ok: false, reason: exists ? 'too-soon' : 'not-found' } as const;
    }

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'workspace.member.invited',
      targetType: 'invite',
      targetId: row.id,
      metadata: { role: row.role, resent: true },
    });

    const [inviter] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, row.invitedBy))
      .limit(1);

    return { ok: true, invite: toPendingInvite(row, inviter?.name ?? '', now), token } as const;
  });
}

/** Take back an invitation nobody has answered. Its link stops working at once. */
export async function revokeWorkspaceInvite(
  db: Database,
  input: { workspaceId: string; inviteId: string; actorId: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(workspaceInvites)
      .set({ revokedAt: now })
      .where(
        and(
          eq(workspaceInvites.id, input.inviteId),
          eq(workspaceInvites.workspaceId, input.workspaceId),
          PENDING,
        ),
      )
      .returning({ id: workspaceInvites.id });
    if (!row) return false;

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'workspace.invite.revoked',
      targetType: 'invite',
      targetId: row.id,
    });
    return true;
  });
}

/** What the join page shows about an invitation. */
export interface InviteDetails {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: InvitableRole;
  inviterName: string;
  expiresAt: Date;
}

export type InviteRejection =
  | 'not-found'
  | 'revoked'
  | 'expired'
  | 'accepted'
  | 'workspace-deleted';

export type InviteLookup =
  | { ok: true; invite: InviteDetails }
  | { ok: false; reason: 'not-found' }
  | {
      ok: false;
      reason: Exclude<InviteRejection, 'not-found'>;
      invite: InviteDetails;
      /** Who accepted it, so the person who did can be sent on rather than turned away. */
      acceptedBy: string | null;
    };

/**
 * Resolve a token from an email to its invitation, or say why it no longer
 * works. Every condition is read live from the row, so revoking or sending
 * again takes effect on the next click.
 *
 * Reveals the workspace's name and who sent it, and only to somebody holding a
 * token that was mailed to the invited address.
 */
export async function lookupWorkspaceInvite(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<InviteLookup> {
  const [row] = await db
    .select({
      invite: workspaceInvites,
      workspaceName: workspaces.name,
      workspaceDeletedAt: workspaces.deletedAt,
      inviterName: users.name,
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .innerJoin(users, eq(users.id, workspaceInvites.invitedBy))
    .where(eq(workspaceInvites.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return { ok: false, reason: 'not-found' };

  const { invite } = row;
  const details: InviteDetails = {
    id: invite.id,
    workspaceId: invite.workspaceId,
    workspaceName: row.workspaceName,
    email: invite.email,
    role: invite.role as InvitableRole,
    inviterName: row.inviterName,
    expiresAt: invite.expiresAt,
  };

  const reason = rejectionOf(invite, row.workspaceDeletedAt, now);
  if (reason) return { ok: false, reason, invite: details, acceptedBy: invite.acceptedBy };
  return { ok: true, invite: details };
}

/**
 * Why an invitation cannot be accepted now, or null when it can. Accepted is
 * asked first: an invitation that did its job should say so, not that it has
 * since expired.
 */
export function rejectionOf(
  invite: Pick<WorkspaceInviteRow, 'acceptedAt' | 'revokedAt' | 'expiresAt'>,
  workspaceDeletedAt: Date | null,
  now: Date,
): Exclude<InviteRejection, 'not-found'> | null {
  if (invite.acceptedAt) return 'accepted';
  if (workspaceDeletedAt) return 'workspace-deleted';
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  return null;
}

export type AcceptInviteOutcome =
  | {
      ok: true;
      workspaceId: string;
      /** False when they were in the workspace already; the invitation is used up either way. */
      joined: boolean;
    }
  | { ok: false; reason: InviteRejection | 'wrong-account' | 'no-account' };

/**
 * Join a workspace by accepting an invitation, as the signed-in user.
 *
 * Only the account with the invited address may: the token proves somebody
 * read that inbox, and the matching address proves it was the person signed
 * in here. Together they also confirm the address, as following a
 * verification link would, so a person who signed up from the invitation is
 * not then asked to confirm the same inbox again.
 *
 * Locks the invitation first, so two tabs accepting at once join once.
 * Someone already in the workspace keeps the role they have — an invitation
 * adds people, it does not change anyone's standing.
 */
export async function acceptWorkspaceInvite(
  db: Database,
  token: string,
  userId: string,
  now: Date = new Date(),
): Promise<AcceptInviteOutcome> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.tokenHash, hashToken(token)))
      .for('update')
      .limit(1);
    if (!invite) return { ok: false, reason: 'not-found' } as const;

    const [workspace] = await tx
      .select({ deletedAt: workspaces.deletedAt })
      .from(workspaces)
      .where(eq(workspaces.id, invite.workspaceId))
      .limit(1);

    // A workspace row that is missing altogether reads as deleted.
    const reason = rejectionOf(invite, workspace ? workspace.deletedAt : now, now);
    if (reason === 'accepted' && invite.acceptedBy === userId) {
      // A second click on the same email, by the person it already let in.
      return { ok: true, workspaceId: invite.workspaceId, joined: false } as const;
    }
    if (reason) return { ok: false, reason } as const;

    const [account] = await tx
      .select({ email: users.email, isGuest: users.isGuest, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!account || account.isGuest || account.disabledAt) {
      return { ok: false, reason: 'no-account' } as const;
    }
    if (account.email.trim().toLowerCase() !== invite.email) {
      return { ok: false, reason: 'wrong-account' } as const;
    }

    const [added] = await tx
      .insert(memberships)
      .values({ workspaceId: invite.workspaceId, userId, role: invite.role, joinedAt: now })
      .onConflictDoNothing({ target: [memberships.workspaceId, memberships.userId] })
      .returning({ id: memberships.id });

    await tx
      .update(workspaceInvites)
      .set({ acceptedAt: now, acceptedBy: userId })
      .where(eq(workspaceInvites.id, invite.id));

    // Following the link proved control of the inbox. Kept if already set:
    // the column records when the address was first confirmed, once.
    await tx
      .update(users)
      .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now})` })
      .where(eq(users.id, userId));

    if (added) {
      await tx.insert(auditLog).values({
        workspaceId: invite.workspaceId,
        actorId: userId,
        action: 'workspace.member.joined',
        targetType: 'membership',
        targetId: added.id,
        metadata: { inviteId: invite.id, role: invite.role, invitedBy: invite.invitedBy },
      });
    }

    return { ok: true, workspaceId: invite.workspaceId, joined: Boolean(added) } as const;
  });
}
