import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  accountDeletionPreview,
  authSessions,
  requestAccountDeletion,
  users,
  type AccountDeletionPreview,
} from '@canvasflow/db';
import { SUPPORT_EMAIL } from '@canvasflow/types';
import type { RequestOrigin } from '../../common/request-origin.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AuditService, type RequestContext } from '../auth/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SignInRateLimiter, SignInThrottledException } from '../auth/sign-in-rate-limit.service.js';
import { EmailService } from '../email/email.service.js';
import {
  RECENT_SIGN_IN_MS,
  confirmsAddress,
  identityCheckFor,
  recentSignInUntil,
  type IdentityCheck,
} from './deletion-checks.js';

/** What the screen that asks needs: what would go, and how to confirm it is them. */
export interface DeletionPreview extends AccountDeletionPreview {
  /** What to type to confirm. */
  email: string;
  identityCheck: IdentityCheck;
  /**
   * For `recent-sign-in`: until when this sign-in is recent enough to ask, or
   * null when it already is not and the person has to sign in again first.
   * Always null for `password`, which does not go by the sign-in.
   */
  recentSignInUntil: string | null;
  graceDays: number;
}

export interface DeletionRequestInput {
  confirmEmail: string;
  currentPassword?: string;
}

/**
 * Deleting your own account, from a signed-in device.
 *
 * Only the asking lives here. The request itself — lock the account, hide the
 * boards it owns, end every session, all at one instant — is one transaction
 * in `@canvasflow/db`, and the erasure is a scheduled job's, once the grace
 * period is over.
 *
 * Nothing here tells the sync-server. Its sweep already re-checks every open
 * editor every few seconds, against sessions and board access alike, so ending
 * the sessions and hiding the boards closes this person's editors, and
 * everyone else's on those boards, without a word from here.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly signInLimits: SignInRateLimiter,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Null for an account that is gone, already locked, or a guest's. */
  async preview(userId: string, sessionId?: string): Promise<DeletionPreview | null> {
    const account = await this.account(userId);
    if (!account) return null;

    const identityCheck = identityCheckFor(account);
    const [what, signedInAt] = await Promise.all([
      accountDeletionPreview(this.database.db, userId),
      identityCheck === 'recent-sign-in' ? this.signedInAt(userId, sessionId) : null,
    ]);

    return {
      ...what,
      email: account.email,
      identityCheck,
      recentSignInUntil:
        identityCheck === 'recent-sign-in'
          ? (recentSignInUntil(signedInAt, new Date())?.toISOString() ?? null)
          : null,
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    };
  }

  /**
   * Ask for the account to be deleted.
   *
   * The typed address comes first because it costs nothing and is not a
   * secret: a slip there should not count as a wrong password. A wrong
   * password counts against the same per-account limit as sign-in, so this
   * cannot be used to guess one faster than the sign-in form allows.
   */
  async request(
    userId: string,
    sessionId: string | undefined,
    input: DeletionRequestInput,
    origin: RequestOrigin,
    context: RequestContext,
  ): Promise<{ purgeAfter: string }> {
    const account = await this.account(userId);
    if (!account) throw new NotFoundException('There is no account here to delete.');

    if (!confirmsAddress(input.confirmEmail, account.email)) {
      throw new BadRequestException('Type your email address exactly as it is on your account.');
    }

    const identityCheck = identityCheckFor(account);
    if (identityCheck === 'password') {
      if (!input.currentPassword) throw new BadRequestException('Enter your password.');

      // Before any hashing, for the same reason sign-in does it first.
      const allowance = await this.signInLimits.check(account.email);
      if (!allowance.allowed) throw new SignInThrottledException(allowance.retryAfterSeconds);

      if (!(await this.passwords.verify(input.currentPassword, account.passwordHash))) {
        await this.signInLimits.record(account.email);
        throw new BadRequestException('Your password is not right.');
      }
    } else if (!recentSignInUntil(await this.signedInAt(userId, sessionId), new Date())) {
      // A code as well as a sentence, because the right response is not to
      // retry but to send the person to sign in again.
      throw new ForbiddenException({
        message: `For your safety, sign in again, then delete your account within ${
          RECENT_SIGN_IN_MS / 60_000
        } minutes.`,
        error: 'Forbidden',
        code: 'recent-sign-in-required',
      });
    }

    const outcome = await requestAccountDeletion(this.database.db, userId);
    if (!outcome.ok) {
      switch (outcome.reason) {
        case 'no-account':
        case 'guest':
          throw new NotFoundException('There is no account here to delete.');
        case 'already-scheduled':
          throw new ConflictException('This account is already scheduled for deletion.');
        case 'shared-workspace':
          throw new ConflictException(
            'You own a workspace other people belong to. Hand it over or remove them first.',
          );
      }
    }

    const { request, hiddenBoardIds } = outcome;

    await this.audit.record({
      action: 'auth.account.deletion_requested',
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      metadata: {
        requestId: request.id,
        purgeAfter: request.purgeAfter.toISOString(),
        hiddenBoards: hiddenBoardIds.length,
        identityCheck,
      },
      context,
    });
    await this.audit.record({
      action: 'auth.session.revoked',
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      metadata: { scope: 'all', reason: 'account_deletion' },
      context,
    });

    // Not awaited: the reply should not wait on the mail provider, and the
    // send never throws.
    void this.email.sendAccountDeletion(
      { to: account.email, userId },
      {
        accountName: account.name,
        purgeAfter: request.purgeAfter,
        ownedBoards: hiddenBoardIds.length,
        supportEmail: SUPPORT_EMAIL,
        requestedFrom: origin,
      },
    );

    return { purgeAfter: request.purgeAfter.toISOString() };
  }

  /** The account as it stands, or null for one that is gone, locked or a guest. */
  private async account(userId: string) {
    const [row] = await this.database.db
      .select({
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        isGuest: users.isGuest,
        disabledAt: users.disabledAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row || row.isGuest || row.disabledAt) return null;
    return row;
  }

  /**
   * When the session behind this request began — refreshing it does not move
   * that — or null when the credential named none, or one that no longer stands.
   */
  private async signedInAt(userId: string, sessionId?: string): Promise<Date | null> {
    if (!sessionId) return null;
    const [session] = await this.database.db
      .select({ createdAt: authSessions.createdAt })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.id, sessionId),
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return session?.createdAt ?? null;
  }
}
