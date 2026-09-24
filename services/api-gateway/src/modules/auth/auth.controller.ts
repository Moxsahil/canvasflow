import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService, type AuthenticatedAccount, type SignupResult } from './auth.service.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { parseEnv } from '../../config/env.js';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { requestLocation } from '../../common/request-origin.js';
import { passwordSchema } from './password-policy.js';
import type { RequestContext } from './audit.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from './jwt.guard.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from './auth-cookies.js';

/**
 * What sign-in says out loud.
 *
 * No tokens. They are in HttpOnly cookies, and repeating them here would put
 * the long-lived one somewhere a script could read.
 */
interface SignInResponse {
  account: AuthenticatedAccount;
  /** So a client knows when to renew rather than waiting to be refused. */
  accessTokenExpiresAt: string;
}

/**
 * The only gate that counts. A `minLength` on the form is a convenience the
 * browser enforces and anything posting straight at this route ignores, so the
 * rules live on the server, where a request cannot get past them — in
 * password-policy.ts, shared with every other place a password is chosen.
 */
const signupSchema = z.object({
  // Trimmed, validated, then lowered. Every major provider treats an address
  // case-insensitively, so storing one canonical form is what stops the same
  // person holding two accounts.
  email: z.string().trim().email('Invalid email').toLowerCase(),
  password: passwordSchema,
  name: z.string().trim().min(1, 'Name is required'),
});

/**
 * Sign-in validates shape only, never strength.
 *
 * The rules above are for choosing a password. Applying them here would refuse
 * anyone whose password predates a rule, because their stored hash would still
 * match while the policy no longer did, and it would tell a caller which of
 * their guesses were even worth hashing.
 *
 * Both fields are bounded so an oversized body is refused before any database
 * or hashing work. 320 characters is the longest address an RFC allows, and
 * 200 is far past any real password and well past the 72 bytes bcrypt reads.
 */
const signInSchema = z.object({
  email: z.string().trim().max(320).email('Invalid email or password').toLowerCase(),
  password: z.string().min(1, 'Invalid email or password').max(200),
});

/**
 * Deliberately unguarded. This is where an account begins, so there is no
 * token to present yet; what protects it is the per-IP limit that belongs in
 * front of it.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async signup(@Body() body: unknown): Promise<{ data: SignupResult }> {
    const parsed = signupSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid signup payload');
    }

    return { data: await this.auth.signup(parsed.data) };
  }

  /**
   * Establish who a pair of credentials belongs to, and start a session.
   *
   * Answers 200 with the account and the session in two HttpOnly cookies, or
   * 401 with one sentence that covers every way this can fail.
   *
   * The per-IP budget is looser than signup's because people mistype
   * passwords and offices share one address, and because it is not the real
   * defence. The limit on failures per address is, and it answers the same
   * whether or not the address has an account, since a limiter that behaves
   * differently for one that exists becomes the very thing the error message
   * refuses to be.
   */
  @Post('signin')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async signIn(
    @Body() body: unknown,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: SignInResponse }> {
    const parsed = signInSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException('Invalid email or password');
    }

    const result = await this.auth.signIn(parsed.data, contextOf(request, userAgent));

    setSessionCookies(response, result);

    // The tokens are in the cookies, not here. A body that also carried them
    // would put the long-lived one somewhere JavaScript can read, which is the
    // thing HttpOnly exists to prevent. The expiry is safe to publish and is
    // what tells a client when to renew.
    return {
      data: {
        account: result.account,
        accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
      },
    };
  }

  /**
   * Trade a refresh token for a fresh pair.
   *
   * The cookie that carries it is scoped to `/auth`, so this route is one of
   * the few places a browser sends it at all — which is the point of that
   * scoping, and the reason this endpoint lives under the same prefix.
   *
   * 401 for every refusal, with the cookies cleared on the way out. A caller
   * whose session cannot be renewed has to sign in, and leaving a dead
   * credential in their browser only means the next request fails the same way.
   *
   * Throttled, because this is the one authenticated route somebody can call
   * without an account: the budget is per address, and a refused refresh costs
   * a hash and an indexed lookup.
   */
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: SignInResponse }> {
    const cookies = request.cookies as Record<string, string> | undefined;
    const result = await this.auth.refresh(cookies?.[REFRESH_COOKIE]);

    if (!result) {
      clearSessionCookies(response);
      throw new UnauthorizedException('Session expired');
    }

    setSessionCookies(response, result);

    return {
      data: {
        account: result.account,
        accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
      },
    };
  }

  /**
   * End the current session, on the server and in the browser.
   *
   * Unguarded on purpose. Requiring a valid access token would mean somebody
   * whose token had just expired could not sign out, and would leave the
   * session row live — the exact state this route exists to clear. Whoever
   * presents the credential is the only one who can end it.
   *
   * 204 always, whatever was presented. Signing out when not signed in is not
   * a failure; it is the requested end state. Answering differently would also
   * turn this into a way to ask whether a token is still good.
   *
   * `SameSite=Lax` on both cookies is the real defence: a cross-site form post
   * does not carry them, so it arrives with nothing to revoke. The Origin
   * check is the second layer, and is here because it is the same rule the web
   * app's own logout applies — one of the two relaxing quietly would be worse
   * than neither having it.
   */
  @Post('signout')
  @HttpCode(204)
  async signOut(
    @Req() request: Request,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (!isAllowedOrigin(origin, parseEnv())) {
      throw new ForbiddenException('Cross-origin sign-out is not allowed');
    }

    const cookies = request.cookies as Record<string, string> | undefined;

    await this.auth.signOut(
      {
        refreshToken: cookies?.[REFRESH_COOKIE],
        accessToken: cookies?.[ACCESS_COOKIE],
      },
      contextOf(request, request.headers['user-agent']),
    );

    clearSessionCookies(response);
  }

  /**
   * End every session this account has, on every device.
   *
   * Guarded, unlike the plain sign-out, because this one needs to know whose
   * sessions to end and the answer has to come from a credential rather than
   * from the request. A route that took an account id would let anybody sign
   * anybody else out.
   *
   * The caller's own session goes with the rest, and their cookies are cleared
   * here so the browser that asked does not carry on holding a credential that
   * no longer works.
   */
  @Post('signout-all')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async signOutEverywhere(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (!isAllowedOrigin(origin, parseEnv())) {
      throw new ForbiddenException('Cross-origin sign-out is not allowed');
    }

    await this.auth.signOutEverywhere(user.id, contextOf(request, request.headers['user-agent']));
    clearSessionCookies(response);
  }
}

/**
 * Who is calling, as far as the edge can tell.
 *
 * `request.ip` is only as good as the proxy count in `TRUST_PROXY_HOPS`, which
 * is the same number every per-IP limit already depends on. Recorded for the
 * audit trail, never used to decide anything.
 */
function contextOf(request: Request, userAgent: string | undefined): RequestContext {
  return {
    ip: request.ip ?? null,
    userAgent: userAgent ?? null,
    location: requestLocation(request, {
      trustEdgeHeaders: Boolean(parseEnv().ORIGIN_AUTH_SECRET),
    }),
  };
}
