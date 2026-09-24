import { Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { accounts, users, type DatabaseExecutor, type UserRow } from '@canvasflow/db';
import { parseEnv } from '../../../config/env.js';
import { describeDevice } from '../../../common/request-origin.js';
import { DatabaseService } from '../../../infra/database/database.service.js';
import { EmailService } from '../../email/email.service.js';
import { AuditService, type RequestContext } from '../audit.service.js';
import { SessionService } from '../session.service.js';
import { TokenService } from '../token.service.js';
import type { SignInResult } from '../auth.service.js';
import { matchOnAddress } from './address-match.js';

export type OAuthProvider = 'google' | 'github';

/**
 * What a provider told us, in the one shape both of them answer in.
 *
 * Carries no tokens. Nothing in CanvasFlow calls a provider's API on somebody's
 * behalf after they are signed in, so the access token has no reader here, and
 * a credential nobody reads is only a credential waiting to leak.
 */
export interface OAuthIdentity {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string | null;
  /** The provider's own verdict, read rather than assumed. */
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  scope: string;
}

/** Everything the browser can be told, in a word it can carry in a URL. */
export type OAuthErrorCode =
  | 'no_email'
  | 'email_unverified'
  | 'account_disabled'
  | 'not_configured'
  | 'provider_error';

export class OAuthSignInError extends Error {
  constructor(readonly code: OAuthErrorCode) {
    super(code);
    this.name = 'OAuthSignInError';
  }
}

/**
 * The OIDC providers report `oidc`; the plain OAuth2 ones report `oauth`.
 * Matched to what Auth.js already wrote so old rows and new ones agree.
 */
const ACCOUNT_TYPE: Record<OAuthProvider, string> = {
  google: 'oidc',
  github: 'oauth',
};

const PROVIDERS = Object.keys(ACCOUNT_TYPE) as OAuthProvider[];

/** What taking over an unconfirmed account removed, for the audit trail and the owner's mail. */
interface AccountClaim {
  passwordRemoved: boolean;
  providersRemoved: OAuthProvider[];
}

interface ResolvedUser {
  user: UserRow;
  /** Set when this sign-in took over an account whose address nobody had confirmed. */
  claim: AccountClaim | null;
}

/**
 * Turns "this provider vouched for this person" into a CanvasFlow session.
 *
 * The session it issues is the same one a password sign-in gets: same cookies,
 * same lifetimes, same revocable row. How somebody proved who they are is not
 * something the rest of the API should have to know.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly env = parseEnv();

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async signIn(identity: OAuthIdentity, context: RequestContext): Promise<SignInResult> {
    const { user, claim } = await this.resolveUser(identity);

    // Same refusal the password path gives a barred account. Arriving through
    // a provider is a different door, not a different rule.
    if (user.disabledAt || user.isGuest) {
      throw new OAuthSignInError('account_disabled');
    }

    // A claim has already confirmed the address, in its own transaction.
    if (claim) await this.reportClaim(user, identity, claim, context);
    else await this.recordVerification(user, identity);

    // Only now, after a claim has ended every session the account had, so the
    // one this sign-in gets is the only one left standing.
    const session = await this.sessions.create(user.id, context.userAgent, context.location);
    const access = await this.tokens.issue({ userId: user.id, sessionId: session.sessionId });

    await this.audit.record({
      action: 'auth.login',
      actorId: user.id,
      targetType: 'session',
      targetId: session.sessionId,
      metadata: { method: identity.provider },
      context,
    });

    return {
      account: { id: user.id, email: user.email, name: user.name, image: user.avatarUrl },
      sessionId: session.sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }

  /**
   * Find the account this identity belongs to, linking or creating one if it
   * does not have a row yet.
   *
   * Three cases in order of certainty: a provider account we have seen before,
   * an existing account on the same address, and somebody entirely new.
   *
   * Linking on a matching address is safe only when both sides have confirmed
   * it: the provider (otherwise the provider account may be somebody else's)
   * and this account (otherwise somebody else may have set it up).
   * `matchOnAddress` decides, and weakening it turns this method into an
   * account takeover.
   *
   * Note what is deliberately absent: no branch here reads an existing
   * session. Signing in through a provider says which account you are, never
   * "attach this provider to whoever I am already signed in as". That second
   * behaviour is how a provider account ends up as a permanent key into
   * somebody else's account.
   */
  private async resolveUser(identity: OAuthIdentity): Promise<ResolvedUser> {
    const db = this.database.db;

    const [linked] = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, identity.provider),
          eq(accounts.providerAccountId, identity.providerAccountId),
        ),
      )
      .limit(1);

    if (linked) {
      const [user] = await db.select().from(users).where(eq(users.id, linked.userId)).limit(1);
      // The row is gone but its account link survived, which a cascade should
      // have prevented. Refusing is the only honest answer; creating a second
      // account here would silently hand somebody a blank one.
      if (!user) throw new OAuthSignInError('provider_error');
      return { user, claim: null };
    }

    // Everything below needs an address, and a provider is entitled to release
    // none. Nothing can be matched or created without one.
    if (!identity.email) throw new OAuthSignInError('no_email');
    const email = identity.email.trim().toLowerCase();

    // Case-insensitive for the same reason the password path is: addresses
    // registered before they were normalised still carry their original
    // casing, and an exact match would not find them.
    const [existing] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (existing) {
      switch (matchOnAddress(existing, identity.emailVerified)) {
        case 'refuse':
          // Refusing is the only option left: the address is taken, and a
          // second row could not be created for it even if that were right.
          throw new OAuthSignInError('email_unverified');
        case 'barred':
          return { user: existing, claim: null };
        case 'link':
          await this.link(existing.id, identity);
          return { user: existing, claim: null };
        case 'claim':
          return { user: existing, claim: await this.claim(existing.id, identity) };
      }
    }

    return { user: await this.create(email, identity), claim: null };
  }

  /**
   * Take over an account whose address nobody had confirmed, for the person a
   * provider has just confirmed it for.
   *
   * Everything added before that proof is removed: the password, any provider
   * link (on an account like this, one can only have been made with an address
   * its provider had not confirmed either), and every signed-in device, whose
   * open editors the sync-server closes within seconds. All in one
   * transaction, so there is no moment where this provider is linked and a
   * password somebody else chose still works.
   *
   * The boards stay. They belong to the account, and the owner can see what is
   * there and delete it; wiping them would cost somebody who set the account up
   * themselves everything they made before confirming.
   *
   * Null when, by the time the row is locked, the address has been confirmed
   * after all — a verification link followed a moment earlier, or a second tab
   * finishing this same claim. Then this is an ordinary link.
   */
  private async claim(userId: string, identity: OAuthIdentity): Promise<AccountClaim | null> {
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ passwordHash: users.passwordHash, emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!current) throw new OAuthSignInError('provider_error');

      if (current.emailVerifiedAt) {
        await this.link(userId, identity, tx);
        return null;
      }

      const now = new Date();
      await tx
        .update(users)
        .set({
          passwordHash: null,
          // Only when there was one to remove. Dating it also retires every
          // reset link issued before now, which the reset check compares
          // against this column.
          ...(current.passwordHash ? { passwordChangedAt: now } : {}),
          emailVerifiedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      const unlinked = await tx
        .delete(accounts)
        .where(eq(accounts.userId, userId))
        .returning({ provider: accounts.provider });
      await this.link(userId, identity, tx);

      await this.sessions.revokeAllFor(userId, tx);

      return {
        passwordRemoved: current.passwordHash !== null,
        providersRemoved: PROVIDERS.filter((provider) =>
          unlinked.some((row) => row.provider === provider),
        ),
      };
    });
  }

  /**
   * Write a claim down, and tell the owner — the only person the address now
   * reaches — what was removed and how to add a password back.
   */
  private async reportClaim(
    user: UserRow,
    identity: OAuthIdentity,
    claim: AccountClaim,
    context: RequestContext,
  ): Promise<void> {
    await this.audit.record({
      action: 'auth.account.claimed',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { provider: identity.provider, ...claim },
      context,
    });
    await this.audit.record({
      action: 'auth.session.revoked',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { scope: 'all', reason: 'account_claimed' },
      context,
    });

    // Not awaited: the redirect should not wait on the mail provider, and the
    // send never throws.
    void this.email.sendAccountClaimed(
      { to: user.email, userId: user.id },
      {
        accountName: user.name,
        provider: identity.provider,
        ...claim,
        appUrl: new URL('/open', this.env.WEB_URL).toString(),
        claimedFrom: {
          at: new Date(),
          device: describeDevice(context.userAgent ?? undefined),
          location: context.location ?? null,
        },
      },
    );
  }

  /** Attach a provider account to a user that already exists. */
  private async link(
    userId: string,
    identity: OAuthIdentity,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<void> {
    await executor
      .insert(accounts)
      .values({
        userId,
        type: ACCOUNT_TYPE[identity.provider],
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        scope: identity.scope,
      })
      // A second sign-in through the same provider, or two tabs racing. The
      // row already says what this one would say, and the columns it does not
      // touch belong to whatever wrote it first.
      .onConflictDoNothing();
  }

  private async create(email: string, identity: OAuthIdentity): Promise<UserRow> {
    const [created] = await this.database.db
      .insert(users)
      .values({
        email,
        // The column is not null and a provider may release no display name.
        // The local part is what the person would recognise, and they can
        // change it afterwards.
        name: identity.name ?? email.split('@')[0] ?? email,
        avatarUrl: identity.image,
        // Stamped at creation when the provider confirmed the address, so
        // somebody who has only ever signed in this way is never asked to
        // confirm an address to an account that has no password to return to.
        emailVerifiedAt: identity.emailVerified ? new Date() : null,
      })
      .returning();

    if (!created) throw new Error('User row was not returned after insert');

    await this.link(created.id, identity);
    return created;
  }

  /**
   * Record that a provider vouched for this address.
   *
   * On every sign-in rather than only the first, because the case worth
   * catching is somebody who registered with a password and later proved the
   * same address through a provider — no user is created there, so a
   * creation-only write would miss it.
   *
   * Guarded on the column being null so a confirmation that already happened
   * keeps its original timestamp; that column records when an address was
   * first proved, once.
   *
   * Failures are swallowed deliberately. This is bookkeeping beside a sign-in
   * that has already succeeded, and a database hiccup must not turn into
   * somebody unable to get in.
   */
  private async recordVerification(user: UserRow, identity: OAuthIdentity): Promise<void> {
    if (!identity.emailVerified || user.emailVerifiedAt) return;

    try {
      await this.database.db
        .update(users)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(users.id, user.id), isNull(users.emailVerifiedAt)));
    } catch (cause) {
      this.logger.error(`Could not record provider email verification: ${String(cause)}`);
    }
  }
}
