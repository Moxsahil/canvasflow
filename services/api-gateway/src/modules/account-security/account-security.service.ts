import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { accounts, passwordResetTokens, users } from '@canvasflow/db';
import { parseEnv } from '../../config/env.js';
import { describeDevice, type RequestOrigin } from '../../common/request-origin.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AuditService, type RequestContext } from '../auth/audit.service.js';
import type { OAuthProvider } from '../auth/oauth/oauth.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { SignInRateLimiter, SignInThrottledException } from '../auth/sign-in-rate-limit.service.js';
import { EmailService } from '../email/email.service.js';
import {
  ResetRequestLimiter,
  ResetThrottledException,
} from '../password-reset/reset-request-limiter.service.js';
import { ResetTokenService } from '../password-reset/reset-token.service.js';

const KNOWN_PROVIDERS: readonly OAuthProvider[] = ['google', 'github'];

/**
 * One signed-in device, as its owner is shown it. Nothing here is a
 * credential: the id names a row only this account can see, and is there so a
 * list can be keyed and, later, a single device signed out.
 */
export interface SessionSummary {
  id: string;
  /** "Chrome on Windows", or null when the browser said nothing useful. */
  device: string | null;
  /** "New Delhi, Delhi, India", or null when it was not recorded. */
  location: string | null;
  signedInAt: string;
  lastActiveAt: string;
  /** The device this request came from. */
  current: boolean;
}

export interface AccountSecurity {
  /** Where a set-password link would go, so the page can say so. */
  email: string;
  hasPassword: boolean;
  /** Null for a password set at signup and never changed. */
  passwordChangedAt: string | null;
  signedUpAt: string;
  /** Providers linked to the account, from `accounts`. */
  providers: OAuthProvider[];
  sessions: SessionSummary[];
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  signOutOtherDevices: boolean;
}

/** What happened to the other devices, so the page and the mail can say. */
export type SignedOut = 'other-devices' | 'nowhere' | 'everywhere';

/**
 * Account & Security, for a signed-in account: what it is protected by, where
 * it is signed in, and changing either.
 *
 * Every write here re-checks the account rather than trusting the credential:
 * a token proves who signed in, not that the account still looks the way it
 * did when they did.
 */
@Injectable()
export class AccountSecurityService {
  private readonly logger = new Logger(AccountSecurityService.name);
  private readonly env = parseEnv();

  constructor(
    private readonly database: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly signInLimits: SignInRateLimiter,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly resetTokens: ResetTokenService,
    private readonly resetLimiter: ResetRequestLimiter,
  ) {}

  /** Null for an account that is gone, or a guest, who has no account to secure. */
  async overview(userId: string, currentSessionId?: string): Promise<AccountSecurity | null> {
    const account = await this.account(userId);
    if (!account) return null;

    const [providers, live] = await Promise.all([
      this.providersFor(userId),
      this.sessions.listLive(userId),
    ]);

    const sessions = live
      .map(
        (session): SessionSummary => ({
          id: session.id,
          device: describeDevice(session.userAgent ?? undefined),
          location: session.location,
          signedInAt: session.createdAt.toISOString(),
          lastActiveAt: (session.lastUsedAt ?? session.createdAt).toISOString(),
          current: session.id === currentSessionId,
        }),
      )
      // This device first, then newest first, which listLive already is.
      .sort((a, b) => Number(b.current) - Number(a.current));

    return {
      email: account.email,
      hasPassword: account.passwordHash !== null,
      passwordChangedAt: account.passwordChangedAt?.toISOString() ?? null,
      signedUpAt: account.createdAt.toISOString(),
      providers,
      sessions,
    };
  }

  /**
   * Change the password from a signed-in device.
   *
   * The current password is required even though the caller is signed in: a
   * session left open on a shared computer must not be enough to lock the
   * owner out. Wrong answers count against the same per-account limit as
   * sign-in, so this cannot be used to guess passwords at a better rate than
   * the sign-in form allows.
   *
   * The device making the change stays signed in. Every other session ends in
   * the same transaction as the change when the person asked for that — the
   * default — so there is no moment where the password has changed but a
   * device that should have been signed out still works.
   */
  async changePassword(
    userId: string,
    currentSessionId: string | undefined,
    input: ChangePasswordInput,
    origin: RequestOrigin,
    context: RequestContext,
  ): Promise<{ signedOut: SignedOut }> {
    const account = await this.account(userId);
    if (!account) throw new BadRequestException('This account cannot change its password.');
    if (!account.passwordHash) {
      throw new BadRequestException(
        'Your account has no password yet. Add one with the emailed link instead.',
      );
    }

    // Before any hashing, for the same reason sign-in does it first.
    const allowance = await this.signInLimits.check(account.email);
    if (!allowance.allowed) throw new SignInThrottledException(allowance.retryAfterSeconds);

    if (!(await this.passwords.verify(input.currentPassword, account.passwordHash))) {
      await this.signInLimits.record(account.email);
      throw new BadRequestException('Your current password is not right.');
    }
    if (await this.passwords.verify(input.newPassword, account.passwordHash)) {
      throw new BadRequestException('Choose a password different from your current one.');
    }

    const passwordHash = await this.passwords.hash(input.newPassword);
    const now = new Date();

    // Without a session to keep — a credential minted before sessions were
    // named in it — "sign out the others" can only mean everyone.
    const signedOut: SignedOut = !input.signOutOtherDevices
      ? 'nowhere'
      : currentSessionId
        ? 'other-devices'
        : 'everywhere';

    await this.database.db.transaction(async (tx) => {
      // Conditional on the hash still being the one that was just checked, so
      // two changes racing from two devices cannot both land: the second finds
      // nothing to update and is told so, rather than silently winning.
      const updated = await tx
        .update(users)
        .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
        .where(and(eq(users.id, userId), eq(users.passwordHash, account.passwordHash as string)))
        .returning({ id: users.id });
      if (updated.length === 0) {
        throw new ConflictException('Your password was just changed somewhere else. Try again.');
      }

      // A reset link issued before this change must not undo it.
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

      if (signedOut === 'other-devices') {
        await this.sessions.revokeAllExcept(userId, currentSessionId as string, tx);
      } else if (signedOut === 'everywhere') {
        await this.sessions.revokeAllFor(userId, tx);
      }
    });

    try {
      await this.signInLimits.clear(account.email);
    } catch (error) {
      this.logger.error(`Could not clear sign-in failures for user ${userId}`, error);
    }

    await this.audit.record({
      action: 'auth.password.changed',
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      metadata: { method: 'settings', signedOut },
      context,
    });
    if (signedOut !== 'nowhere') {
      await this.audit.record({
        action: 'auth.session.revoked',
        actorId: userId,
        targetType: 'user',
        targetId: userId,
        metadata: {
          scope: signedOut === 'everywhere' ? 'all' : 'others',
          reason: 'password_changed',
        },
        context,
      });
    }

    // Not awaited: the reply should not wait on the mail provider, and the
    // send never throws.
    void this.email.sendPasswordChanged(
      { to: account.email, userId },
      {
        accountName: account.name,
        changedFrom: origin,
        forgotPasswordUrl: this.webUrl('/forgot-password'),
        signedOut,
      },
    );

    return { signedOut };
  }

  /**
   * Email a link to add a password, for an account that signs in only with
   * Google or GitHub.
   *
   * A link rather than a form, on purpose: a password is a new way into the
   * account, and adding one should take proof of the inbox, not just a
   * signed-in browser that somebody else might be sitting at. The link is an
   * ordinary reset link, spent on the ordinary reset page.
   */
  async sendSetupLink(
    userId: string,
    origin: RequestOrigin,
    context: RequestContext,
  ): Promise<{ status: 'sent' }> {
    const account = await this.account(userId);
    if (!account) throw new BadRequestException('This account cannot add a password.');
    if (account.passwordHash) {
      throw new BadRequestException('Your account already has a password. Change it instead.');
    }

    const allowance = await this.resetLimiter.admit(account.email);
    if (!allowance.allowed) throw new ResetThrottledException(allowance.retryAfterSeconds);

    const providers = await this.providersFor(userId);
    const { token, expiresAt } = await this.resetTokens.issue(userId);
    const url = new URL('/reset-password', this.env.WEB_URL);
    url.hash = `token=${token}`;

    const accepted = await this.email.sendPasswordSetup(
      { to: account.email, userId },
      {
        setupUrl: url.toString(),
        expiresAt,
        accountName: account.name,
        providers,
        requestedFrom: origin,
      },
    );

    await this.audit.record({
      action: 'auth.password.reset_requested',
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      metadata: { purpose: 'setup', emailAccepted: accepted },
      context,
    });

    return { status: 'sent' };
  }

  /** The account as it stands, or null for one that is gone, barred or a guest. */
  private async account(userId: string) {
    const [row] = await this.database.db
      .select({
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        passwordChangedAt: users.passwordChangedAt,
        createdAt: users.createdAt,
        isGuest: users.isGuest,
        disabledAt: users.disabledAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row || row.isGuest || row.disabledAt) return null;
    return row;
  }

  private async providersFor(userId: string): Promise<OAuthProvider[]> {
    const rows = await this.database.db
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    return KNOWN_PROVIDERS.filter((known) => rows.some((row) => row.provider === known));
  }

  private webUrl(path: string): string {
    return new URL(path, this.env.WEB_URL).toString();
  }
}
