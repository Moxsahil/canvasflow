import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { termsAcceptance, users } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { VerificationService } from '../email-verification/verification.service.js';
import { AuditService, type RequestContext } from './audit.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { SignInRateLimiter, SignInThrottledException } from './sign-in-rate-limit.service.js';
import { TokenService } from './token.service.js';

/**
 * The only thing a failed sign-in ever says.
 *
 * One sentence for an address with no account, a wrong password, an account
 * that signs in with a provider and has no password at all, and an account
 * that has been barred. Naming which would turn this endpoint into a way to
 * discover who has a CanvasFlow account.
 */
const SIGN_IN_FAILED = 'Invalid email or password';

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  /** The terms version the signup page showed; recorded only while it is the one in force. */
  termsVersion?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

/**
 * Who the credentials belonged to, and nothing else. The tokens travel
 * beside it in {@link SignInResult}, so this is safe to return in a body.
 */
export interface AuthenticatedAccount {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

/**
 * What a successful sign-in produces: who they are, a short credential for
 * ordinary calls, and a long one that renews it.
 *
 * Both tokens are plaintext here and are handed to the caller once. The
 * refresh token is stored only as a digest, so this is the single moment it
 * exists outside the browser holding it.
 */
export interface SignInResult {
  account: AuthenticatedAccount;
  /**
   * The `auth_sessions` row these credentials belong to. Never sent to the
   * browser; it is what a board token names so that ending the session ends
   * the board token too.
   */
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface SignupResult {
  /**
   * Whether the provider took the verification mail. The account exists either
   * way, which is the point: delivery is not part of creating one.
   */
  emailSent: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly verification: VerificationService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly signInLimits: SignInRateLimiter,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Create an account, then put a verification link in front of its owner.
   *
   * The address is unconfirmed when this returns, and stays that way until the
   * link is followed. Nothing here waits on the mail.
   */
  async signup(input: SignupInput): Promise<SignupResult> {
    const db = this.database.db;

    // Compared case-insensitively rather than against the lowered value alone:
    // rows written before addresses were normalised still carry their original
    // casing, and an exact match would not see them, offering a second account
    // on an address that already has one.
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('An account with that email already exists');
    }

    const passwordHash = await this.passwords.hash(input.password);

    let userId: string;
    try {
      const [created] = await db
        .insert(users)
        .values({
          email: input.email,
          name: input.name,
          passwordHash,
          ...termsAcceptance(input.termsVersion),
        })
        .returning({ id: users.id });

      if (!created) throw new Error('User row was not returned after insert');
      userId = created.id;
    } catch (error) {
      // Two requests for the same new address can both clear the check above.
      // The unique index is what actually decides, so its refusal has to give
      // the same answer the check would have.
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with that email already exists');
      }
      throw error;
    }

    const emailSent = await this.verification.sendChallenge(userId, input.email);

    return { emailSent };
  }

  /**
   * Establish who a pair of credentials belongs to, or refuse without saying
   * why.
   *
   * Four different situations end at the same sentence: no account on that
   * address, the wrong password, an account that signs in with a provider and
   * has no password, and an account that has been barred. Every one of them
   * also costs the same time, because the verification runs against a decoy
   * hash when there is nothing real to compare with. A message that refuses to
   * distinguish them is worth nothing if the clock does it instead.
   *
   * On success, starts a new session and issues the pair of tokens for it.
   */
  async signIn(input: SignInInput, context: RequestContext): Promise<SignInResult> {
    // Before the lookup and before any hashing. A per-IP limit counts where a
    // request came from, which whoever is guessing gets to choose; this counts
    // the account they are guessing at, which they do not. Asked of the
    // address as typed, account or no account — a refusal that only happened
    // for real ones would be a way to discover which those are.
    const allowance = await this.signInLimits.check(input.email);
    if (!allowance.allowed) {
      throw new SignInThrottledException(allowance.retryAfterSeconds);
    }

    // Case-insensitive on purpose, and every candidate is checked. Addresses
    // differing only by case were allowed to register twice before the address
    // was normalised, so a handful still map to two rows, and the password is
    // what says which one was meant.
    const candidates = await this.database.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`);

    let matched: (typeof candidates)[number] | undefined;
    for (const candidate of candidates) {
      if (await this.passwords.verify(input.password, candidate.passwordHash)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      // Nothing was compared, because there was nothing to compare against.
      // Pay the cost anyway, or an address with no account answers in
      // milliseconds while a wrong password takes nearly two hundred.
      if (candidates.length === 0) await this.passwords.verify(input.password, null);
      await this.signInLimits.record(input.email);
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }

    // A barred account and a guest both refuse with the same sentence. A guest
    // has no password and could not reach here anyway; the check is explicit so
    // that stays true if guests ever gain one.
    if (matched.disabledAt || matched.isGuest) {
      await this.signInLimits.record(input.email);
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }

    // Settled, so the count of wrong answers stops meaning anything.
    await this.signInLimits.clear(input.email);

    // Identity is settled; now the session. A new row every time, so two
    // devices hold two credentials and either can be taken away without
    // touching the other.
    const session = await this.sessions.create(matched.id, context.userAgent, context.location);
    const access = await this.tokens.issue({
      userId: matched.id,
      sessionId: session.sessionId,
    });

    await this.audit.record({
      action: 'auth.login',
      actorId: matched.id,
      targetType: 'session',
      targetId: session.sessionId,
      metadata: { method: 'password' },
      context,
    });

    return {
      account: {
        id: matched.id,
        email: matched.email,
        name: matched.name,
        image: matched.avatarUrl,
      },
      sessionId: session.sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }

  /**
   * Renew an access token, and replace the credential that renewed it.
   *
   * Refusing and rotating are the same operation here: a token that cannot be
   * exchanged is one the caller has to sign in over, and a token that can is
   * spent in the act of exchanging it. There is no third answer.
   *
   * Every failure reads the same from outside — expired, revoked, invented, or
   * caught being replayed. Only the last of those means anything has gone
   * wrong, and saying so would tell whoever is holding a stolen token that it
   * has been noticed.
   */
  async refresh(refreshToken: string | undefined): Promise<SignInResult | null> {
    if (!refreshToken) return null;

    const outcome = await this.sessions.rotate(refreshToken);
    if (outcome.status !== 'rotated') return null;

    const access = await this.tokens.issue({
      userId: outcome.userId,
      sessionId: outcome.sessionId,
    });

    // Read back rather than carried on the token. The account may have been
    // renamed, or barred, since the session began — and a barred one must stop
    // renewing rather than coast until its refresh window runs out.
    const [account] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.id, outcome.userId))
      .limit(1);

    if (!account || account.disabledAt || account.isGuest) {
      await this.sessions.revoke(outcome.sessionId);
      return null;
    }

    return {
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        image: account.avatarUrl,
      },
      sessionId: outcome.sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: outcome.refreshToken,
      refreshTokenExpiresAt: outcome.expiresAt,
    };
  }

  /**
   * End the session these credentials belong to.
   *
   * A server operation, not a cleared cookie. Dropping the cookie only removes
   * one copy of the credential; the session row stays live, so anything that
   * captured the refresh token before the browser let go of it could carry on
   * renewing indefinitely. Marking the row is what actually ends it.
   *
   * Either credential identifies the session. The refresh token is preferred
   * because it maps straight to the row, but it is scoped to `/auth` and so is
   * not sent to most callers — the access token names the same session in its
   * `sid` claim, which is exactly why that claim is there.
   *
   * Silent about everything. Expired, already revoked, forged, absent: all of
   * them mean the session is not live, which is what was asked for. A sign-out
   * that reported failure would be a way to ask whether a token was still good.
   */
  /**
   * End every session this account has, including the one asking.
   *
   * The thing to reach for when somebody suspects their password or a device
   * has been taken: one action that makes every credential ever issued to them
   * stop working, without needing to know how many there were or where.
   *
   * Deliberately includes the caller's own. "Everywhere" that quietly spared
   * the current browser would leave the one session somebody is most likely to
   * be wrong about — the one on the machine they are not sure is theirs.
   */
  async signOutEverywhere(userId: string, context: RequestContext): Promise<void> {
    await this.sessions.revokeAllFor(userId);
    await this.audit.record({
      action: 'auth.session.revoked',
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      metadata: { scope: 'all' },
      context,
    });
  }

  async signOut(
    credentials: { refreshToken?: string; accessToken?: string },
    context: RequestContext,
  ): Promise<void> {
    if (credentials.refreshToken) {
      const session = await this.sessions.findLive(credentials.refreshToken);
      if (session) {
        await this.sessions.revoke(session.id);
        await this.audit.record({
          action: 'auth.logout',
          actorId: session.userId,
          targetType: 'session',
          targetId: session.id,
          context,
        });
        return;
      }
    }

    if (credentials.accessToken) {
      const claims = await this.tokens.read(credentials.accessToken);
      if (claims) {
        await this.sessions.revoke(claims.sessionId);
        await this.audit.record({
          action: 'auth.logout',
          actorId: claims.userId,
          targetType: 'session',
          targetId: claims.sessionId,
          context,
        });
      }
    }
  }
}

/** Postgres `unique_violation`. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
