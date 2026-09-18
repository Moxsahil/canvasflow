import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { emailVerificationTokens, users, getProfile } from '@canvasflow/db';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { TokenService } from './token.service.js';
import { EmailService } from './email.service.js';
import { ResendRateLimiter } from './resend-rate-limit.service.js';

export type VerificationRejection = 'not-found' | 'expired';

/**
 * Deliberately carries no user id, token id or hash. This crosses to a browser
 * holding an unauthenticated link, and the only thing it needs to know is
 * whether the address is now confirmed.
 */
export type VerificationOutcome =
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; reason: VerificationRejection };

export type ResendResult =
  | { status: 'sent' }
  | { status: 'not-sent' }
  | { status: 'already-verified' }
  | { status: 'rate-limited'; retryAfterSeconds: number };

/**
 * Issues a challenge and puts it in front of the person it belongs to, then
 * spends it when they follow the link.
 *
 * Minting is a database concern and delivery is a network one, and only
 * delivery is allowed to fail quietly.
 */
@Injectable()
export class VerificationService {
  private readonly env = parseEnv();

  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    private readonly limiter: ResendRateLimiter,
  ) {}

  /**
   * Returns whether the mail was accepted, not whether the challenge exists.
   * The row is written either way, so a failed send leaves something the
   * resend flow can supersede rather than nothing at all.
   */
  async sendChallenge(userId: string, address: string): Promise<boolean> {
    const { token, expiresAt } = await this.tokens.issue(userId);

    return this.email.sendVerification({
      to: address,
      verificationUrl: this.verificationUrl(token),
      expiresAt,
    });
  }

  /**
   * Spend a token and confirm the address behind it.
   *
   * The claim is one conditional update rather than a read followed by a
   * write. Two devices opening the same link land on the same row, and only
   * the transaction that finds `used_at` still null gets a row back; the other
   * re-checks the condition after the first commits and matches nothing. That
   * is what stops a double click producing two different answers.
   *
   * A caller that loses the race still deserves a sensible reply, so a token
   * already spent by an account that is now confirmed reads as success.
   * Everything else reads as expired, including a link superseded by a resend:
   * from the person's side those are the same situation, and so is the fix.
   */
  async verify(rawToken: string): Promise<VerificationOutcome> {
    const tokenHash = this.tokens.hash(rawToken);

    return this.database.db.transaction(async (tx) => {
      const now = new Date();

      const consumed = await tx
        .update(emailVerificationTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, tokenHash),
            isNull(emailVerificationTokens.usedAt),
            gt(emailVerificationTokens.expiresAt, now),
          ),
        )
        .returning({ userId: emailVerificationTokens.userId });

      const claimed = consumed[0];
      if (claimed) {
        // Guarded so a second confirmation cannot rewrite the first one's
        // timestamp. The column records when the address was proved, once.
        await tx
          .update(users)
          .set({ emailVerifiedAt: now, updatedAt: now })
          .where(and(eq(users.id, claimed.userId), isNull(users.emailVerifiedAt)));

        return { ok: true as const, alreadyVerified: false };
      }

      const rows = await tx
        .select({
          usedAt: emailVerificationTokens.usedAt,
          emailVerifiedAt: users.emailVerifiedAt,
        })
        .from(emailVerificationTokens)
        .innerJoin(users, eq(users.id, emailVerificationTokens.userId))
        .where(eq(emailVerificationTokens.tokenHash, tokenHash))
        .limit(1);

      const row = rows[0];
      if (!row) return { ok: false as const, reason: 'not-found' as const };

      if (row.usedAt && row.emailVerifiedAt) {
        return { ok: true as const, alreadyVerified: true };
      }

      return { ok: false as const, reason: 'expired' as const };
    });
  }

  /**
   * Whether this account's address is confirmed, read live from the database.
   *
   * Delegated to getProfile rather than reading the column here, because that
   * is the one place that knows the rule — including that a guest reads as
   * confirmed, having no real address to confirm. A second copy of that test
   * would be a second thing to get wrong.
   */
  async statusFor(userId: string): Promise<boolean> {
    const profile = await getProfile(this.database.db, userId);
    return profile?.emailVerified ?? false;
  }

  /**
   * Send another link to the address on the account.
   *
   * The destination is read from the user record, never from the request. An
   * address in a body would turn a signed-in endpoint into a way to mail
   * anybody from our domain, with a working link attached.
   *
   * A confirmed account, a guest with no real address, and an account that no
   * longer exists all answer the same way: nothing was sent, and nothing
   * needed to be. Saying more would tell the caller which case they are in.
   */
  async resend(userId: string): Promise<ResendResult> {
    const profile = await getProfile(this.database.db, userId);
    if (!profile || profile.emailVerified || !profile.email) {
      return { status: 'already-verified' };
    }

    const allowance = await this.limiter.check(userId);
    if (!allowance.allowed) {
      return { status: 'rate-limited', retryAfterSeconds: allowance.retryAfterSeconds };
    }

    const sent = await this.sendChallenge(userId, profile.email);
    return { status: sent ? 'sent' : 'not-sent' };
  }

  /**
   * Built from configuration, never from the incoming request. The raw token
   * appears here and in the mail, and nowhere else.
   */
  private verificationUrl(token: string): string {
    const url = new URL('/verify-email', this.env.WEB_URL);
    url.searchParams.set('token', token);
    return url.toString();
  }
}
