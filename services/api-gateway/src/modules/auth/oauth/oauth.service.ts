import { Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { accounts, users, type UserRow } from '@canvasflow/db';
import { DatabaseService } from '../../../infra/database/database.service.js';
import { AuditService, type RequestContext } from '../audit.service.js';
import { SessionService } from '../session.service.js';
import { TokenService } from '../token.service.js';
import type { SignInResult } from '../auth.service.js';

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

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async signIn(identity: OAuthIdentity, context: RequestContext): Promise<SignInResult> {
    const user = await this.resolveUser(identity);

    // Same refusal the password path gives a barred account. Arriving through
    // a provider is a different door, not a different rule.
    if (user.disabledAt || user.isGuest) {
      throw new OAuthSignInError('account_disabled');
    }

    await this.recordVerification(user, identity);

    const session = await this.sessions.create(user.id, context.userAgent);
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
   * Linking on a matching address is the behaviour the current sign-in already
   * has, and it is safe only while the provider has confirmed that address —
   * the check that enforces it is in the second case below, and deleting it
   * turns this method into an account takeover.
   *
   * Note what is deliberately absent: no branch here reads an existing
   * session. Signing in through a provider says which account you are, never
   * "attach this provider to whoever I am already signed in as". That second
   * behaviour is how a provider account ends up as a permanent key into
   * somebody else's account.
   */
  private async resolveUser(identity: OAuthIdentity): Promise<UserRow> {
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
      return user;
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
      // The address alone is not proof. GitHub lets anybody add any address to
      // their account and only marks it confirmed once they follow a link, so
      // without this an attacker adds the victim's address to a throwaway
      // account, signs in here, and is handed the account that owns it.
      //
      // Refusing is the only option left: the address is taken, and a second
      // row could not be created for it even if that were the right answer.
      if (!identity.emailVerified) throw new OAuthSignInError('email_unverified');

      if (!existing.isGuest) await this.link(existing.id, identity);
      return existing;
    }

    return this.create(email, identity);
  }

  /** Attach a provider account to a user that already exists. */
  private async link(userId: string, identity: OAuthIdentity): Promise<void> {
    await this.database.db
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
