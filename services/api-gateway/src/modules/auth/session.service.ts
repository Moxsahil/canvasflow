import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { authSessionTokens, authSessions, type AuthSessionRow } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';

/**
 * Bytes of entropy in a refresh token. 32 bytes is 256 bits, the same budget
 * a share link and a verification challenge get.
 */
const REFRESH_TOKEN_BYTES = 32;

/**
 * How long a session stays renewable.
 *
 * Matched to the thirty days Auth.js currently gives, so moving to this does
 * not quietly start signing people out more often than they are used to.
 *
 * Absolute, not sliding: rotation issues a new token but never moves this
 * date, so a session ends thirty days after it began however much it was used.
 * A sliding window would keep an active session alive forever, which means a
 * credential stolen from somebody who uses the product daily never expires on
 * its own.
 */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How soon after a token is spent a second presentation is forgiven.
 *
 * Two tabs can reach for the same token at once: both read the cookie before
 * either wrote its replacement, and the slower one arrives holding something
 * that was valid when it set off. That is a race, not a theft, and ending the
 * session over it would sign people out for having two tabs open.
 *
 * Deliberately short. The window is the one gap in reuse detection, and a
 * stolen token replayed inside ten seconds of the real one is a narrow case
 * compared to signing out every user with a second tab.
 */
const REUSE_GRACE_MS = 10_000;

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

  constructor(private readonly database: DatabaseService) {}

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

    if (token.usedAt) {
      if (Date.now() - token.usedAt.getTime() <= REUSE_GRACE_MS) {
        return { status: 'raced' };
      }

      this.logger.warn(
        `Refresh token reuse on session ${session.id}; revoking it for user ${session.userId}`,
      );
      await this.revoke(session.id);
      return { status: 'reused' };
    }

    if (session.revokedAt) return { status: 'invalid' };
    if (session.expiresAt.getTime() <= Date.now()) return { status: 'invalid' };

    // Spend it. Conditional on it still being unspent, so that two requests
    // arriving together cannot both be served: the database decides which one
    // won, not the gap between the read above and this write.
    const spent = await db
      .update(authSessionTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authSessionTokens.id, token.id), isNull(authSessionTokens.usedAt)))
      .returning({ id: authSessionTokens.id });

    if (spent.length === 0) return { status: 'raced' };

    const next = this.mint();
    await db
      .insert(authSessionTokens)
      .values({ sessionId: session.id, tokenHash: this.hash(next) });

    await db
      .update(authSessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(authSessions.id, session.id));

    return {
      status: 'rotated',
      sessionId: session.id,
      userId: session.userId,
      // Inherited, never extended: see the note on REFRESH_TOKEN_TTL_MS.
      expiresAt: session.expiresAt,
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

  /** End every live session an account has. For signing out everywhere. */
  async revokeAllFor(userId: string): Promise<void> {
    await this.database.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
  }
}
