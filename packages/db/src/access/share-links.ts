import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boards } from '../schema/boards.js';
import { users } from '../schema/users.js';
import { boardMembers, type BoardRole } from '../schema/board-access.js';
import { boardShareLinks, type BoardShareLinkRow } from '../schema/sharing.js';

/**
 * Bytes of entropy in a share token.
 *
 * 32 bytes is 256 bits — far past guessing range, which matters because the
 * token is the only thing standing between a URL and a board.
 */
const TOKEN_BYTES = 32;

/** Roles a share link may hand out. Owner is deliberately not grantable. */
export type ShareRole = Extract<BoardRole, 'editor' | 'viewer'>;

export interface CreateShareLinkInput {
  boardId: string;
  createdBy: string;
  role?: ShareRole;
  allowGuests?: boolean;
  expiresAt?: Date | null;
  maxUses?: number | null;
}

export interface CreatedShareLink {
  link: BoardShareLinkRow;
  /** The plaintext token. Returned once, at creation, and never recoverable. */
  token: string;
}

/**
 * Hash a share token for storage and lookup.
 *
 * Plain SHA-256 rather than a password hash: the token is 256 bits of random,
 * so there is no dictionary to attack and nothing for a slow KDF to buy. What
 * we need is that a database dump cannot be replayed as working links, and a
 * one-way digest gives exactly that.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createShareLink(
  db: Database,
  input: CreateShareLinkInput,
): Promise<CreatedShareLink> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  return db.transaction(async (tx) => {
    await tx
      .update(boardShareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(boardShareLinks.boardId, input.boardId), isNull(boardShareLinks.revokedAt)));

    const inserted = await tx
      .insert(boardShareLinks)
      .values({
        boardId: input.boardId,
        tokenHash: hashToken(token),
        role: input.role ?? 'editor',
        createdBy: input.createdBy,
        allowGuests: input.allowGuests ?? true,
        expiresAt: input.expiresAt ?? null,
        maxUses: input.maxUses ?? null,
      })
      .returning();

    const link = inserted[0];
    if (!link) throw new Error('Failed to create share link');
    return { link, token };
  });
}

export type ShareLinkRejection =
  | 'not-found'
  | 'revoked'
  | 'expired'
  | 'exhausted'
  | 'board-deleted';

export type ShareLinkLookup =
  | { ok: true; link: BoardShareLinkRow }
  | { ok: false; reason: ShareLinkRejection };

/**
 * Resolve a plaintext token to a usable link, or say why it isn't one.
 *
 * Every condition is checked live against the row rather than trusted from a
 * signed payload. That is the whole reason share links are rows: "stop sharing
 * this" has to take effect on the next attempt, not whenever a token would
 * have expired on its own.
 */
export async function lookupShareLink(db: Database, token: string): Promise<ShareLinkLookup> {
  const rows = await db
    .select()
    .from(boardShareLinks)
    .where(eq(boardShareLinks.tokenHash, hashToken(token)))
    .limit(1);

  const link = rows[0];
  if (!link) return { ok: false, reason: 'not-found' };
  if (link.revokedAt) return { ok: false, reason: 'revoked' };
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (link.maxUses !== null && link.useCount >= link.maxUses) {
    return { ok: false, reason: 'exhausted' };
  }

  // A link to a deleted board should read as dead, not as an access failure.
  const boardRows = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, link.boardId), isNull(boards.deletedAt)))
    .limit(1);
  if (!boardRows[0]) return { ok: false, reason: 'board-deleted' };

  return { ok: true, link };
}

export type RedeemOutcome =
  | { ok: true; boardId: string; role: BoardRole; userId: string }
  | { ok: false; reason: ShareLinkRejection | 'guests-not-allowed' };

/**
 * Redeem a link for a signed-in user: grant them this board, and only this
 * board.
 *
 * The grant is a `board_members` row, never a `memberships` row. Board access
 * otherwise resolves by joining memberships on workspace_id, so adding the
 * invitee to the workspace would hand them every other board in it — sharing
 * one drawing must not disclose the whole team's work.
 *
 * Idempotent, and safe to re-run: redeeming again refreshes the row rather
 * than stacking duplicates. It will not, however, quietly downgrade someone —
 * see the role guard below.
 */
export async function redeemShareLink(
  db: Database,
  token: string,
  userId: string,
): Promise<RedeemOutcome> {
  const found = await lookupShareLink(db, token);
  if (!found.ok) return { ok: false, reason: found.reason };

  const { link } = found;

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ role: boardMembers.role, status: boardMembers.status })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, link.boardId), eq(boardMembers.userId, userId)))
      .limit(1);

    const current = existing[0];

    // Never let a viewer link demote an existing editor, or resurrect someone
    // an owner has revoked. A share link grants access; it does not administer
    // it, and revocation must not be undoable by replaying an old URL.
    const shouldWrite =
      !current || (current.status === 'active' && rank(link.role) > rank(current.role));

    if (current?.status === 'revoked') {
      return { ok: false as const, reason: 'revoked' as const };
    }

    if (shouldWrite) {
      await tx
        .insert(boardMembers)
        .values({
          boardId: link.boardId,
          userId,
          role: link.role,
          status: 'active',
          grantedBy: link.createdBy,
        })
        .onConflictDoUpdate({
          target: [boardMembers.boardId, boardMembers.userId],
          set: { role: link.role, status: 'active', updatedAt: new Date() },
        });
    }

    await tx
      .update(boardShareLinks)
      .set({ useCount: sql`${boardShareLinks.useCount} + 1`, lastUsedAt: new Date() })
      .where(eq(boardShareLinks.id, link.id));

    return {
      ok: true as const,
      boardId: link.boardId,
      role: shouldWrite ? link.role : (current?.role ?? link.role),
      userId,
    };
  });
}

/** Ordering for "don't downgrade an existing member". */
function rank(role: BoardRole): number {
  return role === 'owner' ? 2 : role === 'editor' ? 1 : 0;
}

/**
 * Redeem a link for someone with no account.
 *
 * They get a real `users` row, flagged `isGuest`. It would be tidier to keep
 * guests out of that table, but `board_updates.author_id`, `audit_log.actor_id`
 * and `board_members.user_id` all reference `users.id` — a guest without a row
 * could sync to peers in memory and then fail every persistence write.
 *
 * The synthetic email is never delivered to; it exists because the column is
 * unique and not null.
 */
export async function redeemShareLinkAsGuest(
  db: Database,
  token: string,
  displayName?: string,
): Promise<RedeemOutcome> {
  const found = await lookupShareLink(db, token);
  if (!found.ok) return { ok: false, reason: found.reason };

  const { link } = found;
  if (!link.allowGuests) return { ok: false, reason: 'guests-not-allowed' };

  return db.transaction(async (tx) => {
    const guestId = randomUUID();
    const inserted = await tx
      .insert(users)
      .values({
        id: guestId,
        email: `guest-${guestId}@guests.invalid`,
        name: sanitizeGuestName(displayName),
        isGuest: true,
      })
      .returning({ id: users.id });

    const guest = inserted[0];
    if (!guest) throw new Error('Failed to create guest user');

    await tx.insert(boardMembers).values({
      boardId: link.boardId,
      userId: guest.id,
      role: link.role,
      status: 'active',
      grantedBy: link.createdBy,
    });

    await tx
      .update(boardShareLinks)
      .set({ useCount: sql`${boardShareLinks.useCount} + 1`, lastUsedAt: new Date() })
      .where(eq(boardShareLinks.id, link.id));

    return { ok: true as const, boardId: link.boardId, role: link.role, userId: guest.id };
  });
}

/**
 * Guests name themselves, so this string is untrusted input that ends up on
 * every collaborator's canvas. Bound it and strip control characters; the
 * renderer measures text before it clips, so an unbounded name is a cost as
 * well as a spoofing surface.
 */
function sanitizeGuestName(name: string | undefined): string {
  const cleaned = (name ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return cleaned.slice(0, 40) || 'Guest';
}

/** Revoking takes effect on the next redemption — nothing is cached. */
export async function revokeShareLink(
  db: Database,
  linkId: string,
  boardId: string,
): Promise<boolean> {
  const updated = await db
    .update(boardShareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(boardShareLinks.id, linkId),
        // Scoped by board so a caller authorized for one board cannot revoke
        // a link belonging to another by guessing its id.
        eq(boardShareLinks.boardId, boardId),
        isNull(boardShareLinks.revokedAt),
      ),
    )
    .returning({ id: boardShareLinks.id });

  return updated.length > 0;
}

/** Active links for a board, newest first. Tokens are not recoverable. */
export async function listShareLinks(db: Database, boardId: string) {
  return db
    .select({
      id: boardShareLinks.id,
      role: boardShareLinks.role,
      allowGuests: boardShareLinks.allowGuests,
      expiresAt: boardShareLinks.expiresAt,
      maxUses: boardShareLinks.maxUses,
      useCount: boardShareLinks.useCount,
      lastUsedAt: boardShareLinks.lastUsedAt,
      createdAt: boardShareLinks.createdAt,
      createdByName: users.name,
    })
    .from(boardShareLinks)
    .innerJoin(users, eq(users.id, boardShareLinks.createdBy))
    .where(and(eq(boardShareLinks.boardId, boardId), isNull(boardShareLinks.revokedAt)))
    .orderBy(desc(boardShareLinks.createdAt));
}
