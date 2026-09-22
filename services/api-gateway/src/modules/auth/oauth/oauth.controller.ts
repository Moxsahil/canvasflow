import { Controller, Get, Headers, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { setSessionCookies } from '../auth-cookies.js';
import { OAuthFailureFilter } from './oauth-failure.filter.js';
import { GitHubOAuthGuard, GoogleOAuthGuard } from './oauth.guards.js';
import { takeNext } from './oauth-next.js';
import { oauthSuccessUrl } from './oauth.redirects.js';
import { OAuthService, type OAuthIdentity } from './oauth.service.js';

/**
 * Signing in through a provider.
 *
 * Four routes, two per provider: one that sends the browser to the provider,
 * one the provider sends it back to. Both are plain navigations, which is why
 * every outcome here is a redirect rather than a status code.
 *
 * The session this produces is identical to the one a password gets — same
 * cookies, same lifetimes, same revocable row — so nothing downstream has to
 * care which door somebody came through.
 *
 * Nothing links to these routes yet. Auth.js still handles every real sign-in
 * until the clients are moved over.
 */
@Controller('auth/oauth')
@UseFilters(OAuthFailureFilter)
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  /**
   * The guard does the work: passport mints a state, sets its cookie, and
   * redirects. This handler is never reached, and exists because a route needs
   * one.
   */
  @Get('google')
  @UseGuards(ThrottlerGuard, GoogleOAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  startGoogle(): void {}

  /**
   * Deliberately unthrottled, unlike the route that starts the flow.
   *
   * A limit here would be spent by the provider returning, not by anyone
   * attacking it, and the state cookie is what makes an unsolicited callback
   * worthless: without the value we set on the way out, there is nothing to
   * match.
   */
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  googleCallback(
    @Req() request: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    return this.complete(request, userAgent, response);
  }

  @Get('github')
  @UseGuards(ThrottlerGuard, GitHubOAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  startGitHub(): void {}

  @Get('github/callback')
  @UseGuards(GitHubOAuthGuard)
  gitHubCallback(
    @Req() request: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    return this.complete(request, userAgent, response);
  }

  /**
   * Both providers end here. `request.user` is whatever the strategy's
   * `validate` returned, normalised to one shape precisely so this step does
   * not have to branch on which provider it was.
   */
  private async complete(
    request: Request,
    userAgent: string | undefined,
    response: Response,
  ): Promise<void> {
    // Passport puts whatever the strategy's `validate` returned here. The
    // repo-wide declaration types this property as the JWT guard's user,
    // because that is what it holds on every other route; these two are the
    // exception, and widening the shared declaration for them would force
    // every other controller to narrow.
    const identity = request.user as unknown as OAuthIdentity;
    const result = await this.oauth.signIn(identity, userAgent ?? null);

    setSessionCookies(response, result);

    // Read back where this sign-in was headed before it left. Spent here, so
    // the next one in this browser starts from nothing.
    response.redirect(oauthSuccessUrl(takeNext(request, response)));
  }
}
