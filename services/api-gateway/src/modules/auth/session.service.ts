import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  authSessionTokens,
  authSessions,
  type AuthSessionRow,
  type DatabaseExecutor,
} from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AuditService } from './audit.service.js';
import {
  ABSOLUTE_SESSION_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  classifyRotation,
  resolveSpent,
} from './rotation-decision.js';

export { ABSOLUTE_SESSION_TTL_MS, REFRESH_TOKEN_TTL_MS };

/**
 * Bytes of entropy in a refresh token. 32 bytes is 256 bits, the same budget
 * a share link and a verification challenge get.
 */
const REFRESH_TOKEN_BYTES = 32;

export interface IssuedSession {
  sessionId: string;
  /** Plaintext. It goes into the cookie and is stored nowhere. */
  refreshToken: string;
  expiresAt: Date;
}

/**
 * What happened when a refresh token was presented.
 *
 * `reused` is kept separate from `invalid` on purpose. They are answered the
 * same way at the edge — the caller signs in again either way — but only one
 * of them means a credential has been copied, and that is worth recording.
 */
export type RotationOutcome =
  | {
      status: 'rotated';
      sessionId: string;
      userId: string;
      refreshToken: string;
      expiresAt: Date;
    }
  | { status: 'raced' }
  | { status: 'reused' }
  | { status: 'invalid' };

/**
 * Owns the long-lived half of being signed in.
 *
 * A row rather than a self-contained token, because the whole point is being
 * able to take it back. Signing out marks it revoked and the credential stops
 * working wherever it is being held.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Digest a refresh token for storage and lookup.
   *
   * Plain SHA-256, for the same reason the other credentials in this codebase
   * use one: the token is 256 bits of random, so there is no dictionary to
   * attack, and what is needed is that a stolen dump cannot be replayed.
   */
  hash(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private mint(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  /** Begin a session and hand back the credential that renews it. */
  async create(userId: string, userAgent: string | null): Promise<IssuedSession> {
    const refreshToken = this.mint();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const [row] = await this.database.db
      .insert(authSessions)
      .values({
        userId,
        expiresAt,
        // Truncated because this is somebody else's string and only ever gets
        // shown back to them; there is no reason to store a kilobyte of it.
        userAgent: userAgent?.slice(0, 256) ?? null,
      })
      .returning();

    if (!row) throw new Error('Session row was not returned after insert');

    await this.database.db
      .insert(authSessionTokens)
      .values({ sessionId: row.id, tokenHash: this.hash(refreshToken) });

    return { sessionId: row.id, refreshToken, expiresAt };
  }

  /**
   * Exchange a refresh token for its successor.
   *
   * Rotation: the presented token is spent and a new one takes its place, so
   * the window in which any single token is worth stealing is one refresh
   * long rather than thirty days.
   *
   * What makes that worth doing is what happens when a spent token comes back.
   * The legitimate holder cannot present one twice — theirs was replaced the
   * first time — so a second presentation means two parties hold the same
   * credential. There is no way to tell which one is calling, so the session
   * ends for both. Signing in again is a smaller harm than a stranger keeping
   * a live session.
   */
  async rotate(refreshToken: string): Promise<RotationOutcome> {
    const db = this.database.db;

    const [token] = await db
      .select()
      .from(authSessionTokens)
      .where(eq(authSessionTokens.tokenHash, this.hash(refreshToken)))
      .limit(1);

    // Never issued here, or issued by a session that has since been deleted.
    // Nothing to tell apart from a guess.
    if (!token) return { status: 'invalid' };

    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, token.sessionId))
      .limit(1);

    if (!session) return { status: 'invalid' };

    const now = Date.now();
    const cap = session.createdAt.getTime() + ABSOLUTE_SESSION_TTL_MS;

    // The judgement lives in rotation-decision.ts, with no database in it, so
    // every branch below is reachable from a test rather than only from a
    // live session in the right state.
    const verdict = classifyRotation(token.usedAt, session, now);

    if (verdict === 'invalid' || verdict === 'raced') return { status: verdict };
    if (verdict === 'rotate') return this.issueSuccessor(session, token.id, now, cap);

    return this.spentAgain(session, token.usedAt as Date, now, cap);
  }

  /**
   * A token that was already spent has come back.
   *
   * Two very different things look like this. Someone copied the credential
   * and both are now using it — the case rotation exists to catch. Or the
   * holder never received the replacement: a dropped response, or a machine
   * that lost power before the browser wrote the new cookie to disk, which is
   * ordinary and costs the person nothing they did wrong.
   *
   * What separates them is whether anybody got any further. If a later token
   * in this session has been spent, two parties have been making progress and
   * the session ends for both. If nothing after this one was ever used, the
   * replacement went nowhere, and the honest reading is that it never arrived.
   *
   * Rescuing invalidates every unspent token in the session, including that
   * undelivered replacement — so if it was taken, it dies here rather than
   * waiting to be used.
   */
  private async spentAgain(
    session: AuthSessionRow,
    usedAt: Date,
    now: number,
    cap: number,
  ): Promise<RotationOutcome> {
    const [progressed] = await this.database.db
      .select({ id: authSessionTokens.id })
      .from(authSessionTokens)
      .where(and(eq(authSessionTokens.sessionId, session.id), gt(authSessionTokens.usedAt, usedAt)))
      .limit(1);

    if (resolveSpent(progressed !== undefined, session.recoveredAt) === 'reused') {
      this.logger.warn(
        `Refresh token reuse on session ${session.id}; revoking it for user ${session.userId}`,
      );
      await this.revoke(session.id);
      // The one event here worth being able to ask about later. No request
      // context: rotation happens several layers below the request, and a
      // half-true address would be worse than none.
      await this.audit.record({
        action: 'auth.session.reuse_detected',
        actorId: session.userId,
        targetType: 'session',
        targetId: session.id,
        metadata: { recovered: session.recoveredAt !== null },
      });
      return { status: 'reused' };
    }

    this.logger.warn(
      `Session ${session.id} presented a spent token whose replacement was never used; ` +
        `treating it as an undelivered rotation and reissuing once`,
    );
    return this.issueSuccessor(session, null, now, cap);
  }

  /**
   * Spend a token and put its replacement in its place.
   *
   * One transaction, because the three writes only mean anything together. A
   * failure between them used to leave the token spent with no successor,
   * which is the same dead end as a lost response and is entirely ours to
   * avoid.
   *
   * `tokenId` names the token being spent. Null means a rescue: every unspent
   * token in the session is retired instead, so exactly one live credential
   * exists afterwards.
   */
  private async issueSuccessor(
    session: AuthSessionRow,
    tokenId: string | null,
    now: number,
    cap: number,
  ): Promise<RotationOutcome> {
    const next = this.mint();
    // Slide the window forward, but never past the absolute cap.
    const expiresAt = new Date(Math.min(now + REFRESH_TOKEN_TTL_MS, cap));
    const spentAt = new Date(now);

    const rotated = await this.database.db.transaction(async (tx) => {
      if (tokenId) {
        // Conditional on it still being unspent, so two requests arriving
        // together cannot both be served: the database decides which one won,
        // not the gap between the read and this write.
        const spent = await tx
          .update(authSessionTokens)
          .set({ usedAt: spentAt })
          .where(and(eq(authSessionTokens.id, tokenId), isNull(authSessionTokens.usedAt)))
          .returning({ id: authSessionTokens.id });

        if (spent.length === 0) return false;
      } else {
        await tx
          .update(authSessionTokens)
          .set({ usedAt: spentAt })
          .where(
            and(eq(authSessionTokens.sessionId, session.id), isNull(authSessionTokens.usedAt)),
          );
      }

      await tx
        .insert(authSessionTokens)
        .values({ sessionId: session.id, tokenHash: this.hash(next) });

      await tx
        .update(authSessions)
        .set({
          lastUsedAt: spentAt,
          expiresAt,
          ...(tokenId ? {} : { recoveredAt: spentAt }),
        })
        .where(eq(authSessions.id, session.id));

      return true;
    });

    if (!rotated) return { status: 'raced' };

    return {
      status: 'rotated',
      sessionId: session.id,
      userId: session.userId,
      // The new expiry, so the cookie that carries the token moves with it.
      expiresAt,
      refreshToken: next,
    };
  }

  /**
   * The live session a refresh token belongs to, or null.
   *
   * Revoked, expired and spent all answer null. A caller has the same thing to
   * do in every case, and distinguishing them would only tempt somebody into
   * saying which.
   */
  async findLive(refreshToken: string): Promise<AuthSessionRow | null> {
    const [token] = await this.database.db
      .select()
      .from(authSessionTokens)
      .where(eq(authSessionTokens.tokenHash, this.hash(refreshToken)))
      .limit(1);

    if (!token) return null;

    const [session] = await this.database.db
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.id, token.sessionId), isNull(authSessions.revokedAt)))
      .limit(1);

    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    return session;
  }

  /** End one session. Idempotent: revoking an already-revoked one is a no-op. */
  async revoke(sessionId: string): Promise<void> {
    await this.database.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
  }

  /**
   * End every live session an account has. For signing out everywhere, and
   * for resetting a password — where it is passed the reset's transaction, so
   * the sessions end if and only if the password actually changed.
   */
  async revokeAllFor(userId: string, executor: DatabaseExecutor = this.database.db): Promise<void> {
    await executor
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
  }
}
