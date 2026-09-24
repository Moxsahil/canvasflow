import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { passwordResetTokens, users } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';

/**
 * 32 bytes is 256 bits: the same budget a verification link, a refresh token
 * and a share link get. The link is the whole proof that somebody reached the
 * inbox, so it sits far past guessing range, and a lookup needs no rate limit
 * of its own to stay safe.
 */
const TOKEN_BYTES = 32;

/**
 * How long a link works. Long enough to switch to an inbox, short enough that
 * an old mail sitting in a mailbox somebody later breaks into is useless.
 * Decided against the server clock, never by the browser holding the link.
 */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Thirty-two bytes as base64url is exactly 43 characters of this alphabet. */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface IssuedResetToken {
  /** The raw token. It goes into the link and is stored nowhere. */
  token: string;
  expiresAt: Date;
}

/** A link and the account it belongs to, as they stand now. */
export interface ResetTokenLookup {
  token: {
    userId: string;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
  };
  account: {
    id: string;
    email: string;
    name: string;
    passwordHash: string | null;
    isGuest: boolean;
    disabledAt: Date | null;
    emailVerifiedAt: Date | null;
    passwordChangedAt: Date | null;
  };
}

/**
 * Mints reset links and keeps only their digests.
 *
 * The same design as the verification links, for the same reasons: opaque
 * random rather than a signed payload, so a link can be taken back before it
 * runs out, and the database stays the authority on whether it has been spent.
 */
@Injectable()
export class ResetTokenService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Issue a link for an account, cancelling any it already had.
   *
   * Only the newest link works. Somebody asking again has told us the one they
   * had is no good to them, and leaving it live would mean two ways into the
   * same account. Cancelled rather than deleted, so "that link said it was no
   * longer valid" can still be looked into.
   */
  async issue(userId: string): Promise<IssuedResetToken> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.database.db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

      await tx.insert(passwordResetTokens).values({
        userId,
        tokenHash: this.hash(token),
        expiresAt,
      });
    });

    return { token, expiresAt };
  }

  /**
   * Find a link and its account without changing either.
   *
   * One indexed read on the unique digest. Opening a link must never spend it —
   * mail scanners and link previews fetch pages before anybody clicks — so this
   * is what the reset page's check and the first step of a reset both use.
   */
  async find(rawToken: string): Promise<ResetTokenLookup | null> {
    const [row] = await this.database.db
      .select({
        userId: passwordResetTokens.userId,
        createdAt: passwordResetTokens.createdAt,
        expiresAt: passwordResetTokens.expiresAt,
        usedAt: passwordResetTokens.usedAt,
        accountId: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        isGuest: users.isGuest,
        disabledAt: users.disabledAt,
        emailVerifiedAt: users.emailVerifiedAt,
        passwordChangedAt: users.passwordChangedAt,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
      .where(eq(passwordResetTokens.tokenHash, this.hash(rawToken)))
      .limit(1);

    if (!row) return null;

    return {
      token: {
        userId: row.userId,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt,
      },
      account: {
        id: row.accountId,
        email: row.email,
        name: row.name,
        passwordHash: row.passwordHash,
        isGuest: row.isGuest,
        disabledAt: row.disabledAt,
        emailVerifiedAt: row.emailVerifiedAt,
        passwordChangedAt: row.passwordChangedAt,
      },
    };
  }

  /**
   * Plain SHA-256 rather than a password hash: the token is 256 bits of random,
   * so there is no dictionary to attack and a slow KDF would buy nothing. What
   * matters is that a stolen dump cannot be replayed as working links.
   */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
