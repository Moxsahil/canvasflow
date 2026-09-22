import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE, setSessionCookies } from './auth-cookies.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';

/**
 * Renew once the access token has less than this left.
 *
 * Wider than the gap between the editor's board-token re-mints, which run a
 * few minutes apart. That way one of them always lands inside the window, the
 * access token is replaced while it still works, and every other call the
 * editor makes on the same cookie keeps finding a valid one.
 */
const RENEW_WITHIN_MS = 5 * 60 * 1000;

export interface ResolvedSession {
  userId: string;
}

/**
 * Who is signed in on this request, renewing the session if it needs it.
 *
 * This is the whole of session renewal, and it lives here rather than in the
 * browser on purpose. The browser never decides whether to renew, never holds
 * a token it can read, and runs no logic to retry: it makes an ordinary
 * request, and if that request carries a refresh cookie the gateway spends it
 * and answers with new cookies alongside whatever was asked for.
 *
 * Only reachable under `/auth`, because that is the only path the refresh
 * cookie is sent to. Every route that renews has to live there.
 */
@Injectable()
export class SessionRenewalService {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  async resolve(request: Request, response: Response): Promise<ResolvedSession | null> {
    const cookies = request.cookies as Record<string, string> | undefined;
    const access = await this.tokens.inspect(cookies?.[ACCESS_COOKIE]);

    // Plenty of time left: nothing to do.
    if (access && access.expiresAt.getTime() - Date.now() > RENEW_WITHIN_MS) {
      return { userId: access.claims.userId };
    }

    // Expired, missing or about to be. Renew if there is anything to renew
    // with; the refresh path already rotates the token, slides the session,
    // catches reuse and refuses barred accounts.
    const refreshToken = cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      const renewed = await this.auth.refresh(refreshToken);
      if (renewed) {
        setSessionCookies(response, renewed);
        return { userId: renewed.account.id };
      }
    }

    // Renewal did not happen, but the token in hand has not expired yet. The
    // usual reason is a second tab that renewed a moment earlier with the same
    // refresh token: this request lost the race, the cookie jar already holds
    // the winner's fresh pair, and failing here would sign a tab out for
    // having a sibling. Serve it on the token that is still valid.
    return access ? { userId: access.claims.userId } : null;
  }
}
