import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { emailVerificationTokens } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Bytes of entropy in a verification token.
 *
 * 32 bytes is 256 bits. The link is the entire proof that someone reached the
 * inbox, so it has to sit well past guessing range.
 */
const TOKEN_BYTES = 32;

/**
 * How long a link stays good.
 *
 * Short on purpose. The token proves someone read that inbox at the moment it
 * was issued, and that proof goes stale. Expiry is decided here, against the
 * server clock, and never by the browser holding the link.
 */
const TOKEN_TTL_MS = 30 * 60 * 1000;

export interface IssuedToken {
  /**
   * The raw token. It goes into the verification URL and is stored nowhere,
   * so once this value is handed back it is not recoverable from the database.
   */
  token: string;
  expiresAt: Date;
}

/**
 * Mints verification tokens and keeps only their digests.
 *
 * Opaque random rather than a signed payload. A JWT in the URL would carry its
 * own expiry and could not be taken back before it ran out; a row can be spent,
 * and the database stays the authority on whether it has been.
 */
@Injectable()
export class TokenService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Issue a challenge for a user and persist only what cannot be replayed.
   */
  async issue(userId: string): Promise<IssuedToken> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.database.db.transaction(async (tx) => {
      // Only the newest link stays live. Someone asking for another has told
      // us the one they had is no good to them, and leaving it working would
      // mean two valid ways into the same account.
      //
      // Stamped used rather than deleted, because these rows are also the
      // record of how often this account has asked, which is what the resend
      // limit counts. Deleting would leave one row behind every time and make
      // that count meaningless.
      await tx
        .update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(
          and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)),
        );

      await tx.insert(emailVerificationTokens).values({
        userId,
        tokenHash: this.hash(token),
        expiresAt,
      });
    });

    return { token, expiresAt };
  }

  /**
   * Digest a raw token for storage and for lookup.
   *
   * Plain SHA-256 rather than a password hash: the token is 256 bits of
   * random, so there is no dictionary to attack and nothing a slow KDF would
   * buy. What is needed is that a stolen dump cannot be replayed as working
   * links, and a one-way digest gives exactly that.
   * 
   * Public because verification hashes the incoming token the same way to find
   * its row. Generation and hashing stay in one service deliberately: two
   * copies of this function would be two chances to disagree.

   */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
