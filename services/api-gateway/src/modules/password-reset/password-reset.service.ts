import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { accounts, passwordResetTokens, users } from '@canvasflow/db';
import { parseEnv } from '../../config/env.js';
import type { RequestOrigin } from '../../common/request-origin.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AuditService, type RequestContext } from '../auth/audit.service.js';
import type { OAuthProvider } from '../auth/oauth/oauth.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { SignInRateLimiter } from '../auth/sign-in-rate-limit.service.js';
import { EmailService } from '../email/email.service.js';
import { classifyResetToken, resetActionFor } from './reset-eligibility.js';
import { ResetRequestLimiter, ResetThrottledException } from './reset-request-limiter.service.js';
import { ResetTokenService, type ResetTokenLookup } from './reset-token.service.js';

const KNOWN_PROVIDERS: readonly OAuthProvider[] = ['google', 'github'];

/**
 * What the reset page is told about a link. Nothing here names the account id,
 * the token row or its digest: this crosses to a browser holding an
 * unauthenticated link.
 */
export type ResetCheck =
  | { valid: true; email: string; expiresAt: string }
  | { valid: false; reason: 'expired' | 'invalid' };

export type ResetOutcome = { ok: true } | { ok: false; reason: 'expired' | 'invalid' };

/** Thrown inside the reset transaction to roll it back when the link was lost. */
class ResetLost extends Error {}

/**
 * Password recovery: sending the link, and later, spending it.
 *
 * The rule everything here serves is that the forgot route gives the same
 * answer, at the same speed, for every address. Whether an account exists is
 * decided only after the reply has gone, and only ever shows up as a mail in
 * the inbox of whoever owns the address.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly env = parseEnv();

  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: ResetTokenService,
    private readonly limiter: ResetRequestLimiter,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly signInLimits: SignInRateLimiter,
  ) {}

  /**
   * Accept a request for a reset link.
   *
   * The only work done before replying is the same for every address: one
   * indexed count and one insert, both keyed on a digest of what was typed.
   * Looking the account up, minting a link and talking to the mail provider
   * would each take longer for a real account than for an unknown one, so all
   * of it happens after the reply — the clock cannot answer the question the
   * reply refuses to.
   */
  async request(email: string, origin: RequestOrigin, context: RequestContext): Promise<void> {
    const allowance = await this.limiter.admit(email);
    if (!allowance.allowed) throw new ResetThrottledException(allowance.retryAfterSeconds);

    // Not awaited, on purpose: see above. The gateway runs on a machine that
    // never sleeps, so this finishes after the reply; a restart in the middle
    // loses one mail, and the person can ask again. deliver() never throws.
    void this.deliver(email, origin, context);
  }

  /**
   * Find every account on the address and send each what it should get.
   *
   * Every account, because a few addresses still map to two rows that differ
   * only by case, from before addresses were normalised. Each gets its own
   * link naming its own account; one failing does not stop the others.
   */
  private async deliver(email: string, origin: RequestOrigin, context: RequestContext) {
    try {
      const candidates = await this.database.db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          passwordHash: users.passwordHash,
          isGuest: users.isGuest,
          disabledAt: users.disabledAt,
        })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);

      for (const candidate of candidates) {
        try {
          await this.deliverTo(candidate, origin, context);
        } catch (error) {
          // The user id, never the address or the link.
          this.logger.error(`Password reset delivery failed for user ${candidate.id}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Password reset delivery failed before any account was found', error);
    }
  }

  private async deliverTo(
    candidate: {
      id: string;
      email: string;
      name: string;
      passwordHash: string | null;
      isGuest: boolean;
      disabledAt: Date | null;
    },
    origin: RequestOrigin,
    context: RequestContext,
  ): Promise<void> {
    const providers = await this.providersFor(candidate.id);
    const action = resetActionFor({ ...candidate, providers });
    const recipient = { to: candidate.email, userId: candidate.id };

    if (action === 'skip') return;

    if (action === 'provider-notice') {
      await this.email.sendProviderNotice(recipient, {
        providers,
        signInUrl: this.webUrl('/login'),
        requestedFrom: origin,
      });
      return;
    }

    const { token, expiresAt } = await this.tokens.issue(candidate.id);
    const accepted = await this.email.sendPasswordReset(recipient, {
      resetUrl: this.resetUrl(token),
      expiresAt,
      accountName: candidate.name,
      providers,
      requestedFrom: origin,
    });

    await this.audit.record({
      action: 'auth.password.reset_requested',
      actorId: candidate.id,
      targetType: 'user',
      targetId: candidate.id,
      metadata: { emailAccepted: accepted },
      context,
    });
  }

  /**
   * Whether a link can still be used, without using it.
   *
   * The reset page asks this as it opens, so somebody holding a dead link is
   * told before they type a new password rather than after. The address comes
   * back for the page's hidden username field, which is what lets a password
   * manager update the right entry; whoever holds a working link can reset the
   * account anyway, so it tells them nothing they could not already act on.
   */
  async check(rawToken: string): Promise<ResetCheck> {
    const found = await this.tokens.find(rawToken);
    if (!found) return { valid: false, reason: 'invalid' };

    const verdict = classifyResetToken(found.token, found.account, new Date());
    if (verdict !== 'valid') return { valid: false, reason: verdict };

    return {
      valid: true,
      email: found.account.email,
      expiresAt: found.token.expiresAt.toISOString(),
    };
  }

  /**
   * Spend a link and replace the password behind it.
   *
   * The order is chosen so that nothing expensive happens for a link that
   * cannot be used: the link is checked before any bcrypt work, so nobody
   * without a real link can make this service spend CPU on hashing. The hash
   * is computed before the transaction opens, so locks are held for
   * milliseconds rather than the ~190ms bcrypt takes.
   *
   * Everything that changes happens in one transaction — the link is spent,
   * the password replaced, the address marked confirmed, every other link
   * cancelled and every session ended — so there is no state in which the
   * password changed but an old session survived, or the reverse.
   */
  async complete(
    rawToken: string,
    password: string,
    origin: RequestOrigin,
    context: RequestContext,
  ): Promise<ResetOutcome> {
    const found = await this.tokens.find(rawToken);
    if (!found) return { ok: false, reason: 'invalid' };

    const verdict = classifyResetToken(found.token, found.account, new Date());
    if (verdict !== 'valid') return { ok: false, reason: verdict };

    const { account } = found;

    // A reset exists to replace a password that is forgotten or not trusted.
    // Setting the same one again does neither, and after a suspected takeover
    // it would leave the account exactly as exposed as before.
    if (account.passwordHash && (await this.passwords.verify(password, account.passwordHash))) {
      throw new BadRequestException('Choose a password different from your current one');
    }

    const passwordHash = await this.passwords.hash(password);
    const tokenHash = this.tokens.hash(rawToken);
    const now = new Date();

    try {
      await this.database.db.transaction(async (tx) => {
        // Conditional on the link still being unspent and in time, so two tabs
        // or a double click cannot both get here: the database decides which
        // one won, not the gap between the check above and this write.
        const spent = await tx
          .update(passwordResetTokens)
          .set({ usedAt: now })
          .where(
            and(
              eq(passwordResetTokens.tokenHash, tokenHash),
              isNull(passwordResetTokens.usedAt),
              gt(passwordResetTokens.expiresAt, now),
            ),
          )
          .returning({ userId: passwordResetTokens.userId });
        if (spent.length === 0) throw new ResetLost();

        const updated = await tx
          .update(users)
          .set({
            passwordHash,
            passwordChangedAt: now,
            // Following the link proved control of the inbox, which is all a
            // verification link proves. Kept if already set: the column
            // records when the address was first confirmed, once.
            emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now})`,
            updatedAt: now,
          })
          // Re-checked here rather than trusted from the read above: an
          // account barred in between must not have its password reset.
          .where(and(eq(users.id, account.id), isNull(users.disabledAt), eq(users.isGuest, false)))
          .returning({ id: users.id });
        if (updated.length === 0) throw new ResetLost();

        // Any other outstanding link for this account dies with the password
        // it was issued to replace.
        await tx
          .update(passwordResetTokens)
          .set({ usedAt: now })
          .where(
            and(eq(passwordResetTokens.userId, account.id), isNull(passwordResetTokens.usedAt)),
          );

        await this.sessions.revokeAllFor(account.id, tx);
      });
    } catch (error) {
      if (!(error instanceof ResetLost)) throw error;
      // Lost to another tab, or the link ran out in the last few milliseconds.
      // Ask again so the answer matches what the page would now be told.
      const again = await this.check(rawToken);
      return { ok: false, reason: again.valid ? 'invalid' : again.reason };
    }

    await this.afterReset(account, origin, context);
    return { ok: true };
  }

  /**
   * Bookkeeping beside a reset that has already committed. Each step is logged
   * if it fails and never undoes the reset: the password has changed whatever
   * happens here.
   */
  private async afterReset(
    account: ResetTokenLookup['account'],
    origin: RequestOrigin,
    context: RequestContext,
  ): Promise<void> {
    try {
      // Somebody locked out by their own wrong guesses has just proved who
      // they are. Leaving the count in place would refuse their first sign-in
      // with the password they just chose.
      await this.signInLimits.clear(account.email);
    } catch (error) {
      this.logger.error(`Could not clear sign-in failures for user ${account.id}`, error);
    }

    await this.audit.record({
      action: 'auth.password.reset',
      actorId: account.id,
      targetType: 'user',
      targetId: account.id,
      metadata: { method: 'email_link', emailNewlyVerified: account.emailVerifiedAt === null },
      context,
    });
    await this.audit.record({
      action: 'auth.session.revoked',
      actorId: account.id,
      targetType: 'user',
      targetId: account.id,
      metadata: { scope: 'all', reason: 'password_reset' },
      context,
    });

    // Not awaited: the reply should not wait on the mail provider, and the
    // send never throws.
    void this.email.sendPasswordChanged(
      { to: account.email, userId: account.id },
      {
        accountName: account.name,
        changedFrom: origin,
        forgotPasswordUrl: this.webUrl('/forgot-password'),
        signedOut: 'everywhere',
      },
    );
  }

  private async providersFor(userId: string): Promise<OAuthProvider[]> {
    const rows = await this.database.db
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    return KNOWN_PROVIDERS.filter((known) => rows.some((row) => row.provider === known));
  }

  /**
   * The link, built from configuration and never from the request's Host
   * header — a URL assembled from a header the caller writes points wherever
   * the caller says.
   *
   * The token goes in the fragment. A browser never sends the fragment to a
   * server, so it stays out of request logs, and a mail scanner that fetches
   * the link fetches a page with no token in it.
   */
  private resetUrl(token: string): string {
    const url = new URL('/reset-password', this.env.WEB_URL);
    url.hash = `token=${token}`;
    return url.toString();
  }

  private webUrl(path: string): string {
    return new URL(path, this.env.WEB_URL).toString();
  }
}
