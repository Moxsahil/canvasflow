import type { Request, Response } from 'express';
import { TERMS_VERSION } from '@canvasflow/types';
import { OAUTH_COOKIE_TTL_MS, oauthCookieOptions } from './oauth-next.js';

const TERMS_COOKIE = 'cf.oauth.terms';

/**
 * Remember which terms the page was showing, before handing the browser to the
 * provider.
 *
 * Every page that starts a provider sign-in says continuing means agreeing to
 * the terms, and names the version in `?terms=`. An account the callback then
 * creates belongs to someone who agreed to that version, so it has to survive
 * the round trip — in a cookie, for the reasons `rememberNext` gives, and only
 * when it is the version in force: a value that was never allowed in is a
 * value that cannot come back out.
 */
export function rememberTerms(request: Request, response: Response): void {
  if (request.query.terms !== TERMS_VERSION) {
    // Cleared rather than left alone, so an abandoned sign-in cannot lend its
    // agreement to the next one started in the same browser.
    response.clearCookie(TERMS_COOKIE, oauthCookieOptions());
    return;
  }

  response.cookie(TERMS_COOKIE, TERMS_VERSION, {
    ...oauthCookieOptions(),
    maxAge: OAUTH_COOKIE_TTL_MS,
  });
}

/**
 * Read the terms version back and spend it: the one this sign-in's page showed,
 * or null when nothing says it showed any. Cleared whatever it said, like the
 * destination beside it.
 */
export function takeTerms(request: Request, response: Response): string | null {
  const cookies = request.cookies as Record<string, string> | undefined;
  const remembered = cookies?.[TERMS_COOKIE];

  response.clearCookie(TERMS_COOKIE, oauthCookieOptions());

  return remembered === TERMS_VERSION ? remembered : null;
}
