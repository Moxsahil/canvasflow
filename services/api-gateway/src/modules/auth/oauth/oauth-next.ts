import type { CookieOptions, Request, Response } from 'express';
import { parseEnv } from '../../../config/env.js';
import { safeRedirect } from '../../../common/safe-redirect.js';

/**
 * Where somebody lands when nothing asked for anywhere in particular.
 *
 * Matches what the web app's own sign-in has always defaulted to, so the
 * destination does not change just because the flow moved.
 */
export const DEFAULT_NEXT = '/open';

const NEXT_COOKIE = 'cf.oauth.next';

/**
 * Long enough for a consent screen, matching the state it travels beside.
 * Shared by every cookie that rides along with a provider sign-in.
 */
export const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000;

/** Scoped to the OAuth routes, like the state cookie. It is no use elsewhere. */
const OAUTH_COOKIE_PATH = '/auth/oauth';

/** The flags every cookie riding along with a provider sign-in is set with. */
export function oauthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: parseEnv().NODE_ENV === 'production',
    sameSite: 'lax',
    path: OAUTH_COOKIE_PATH,
  };
}

/**
 * Remember where to return to, before handing the browser to the provider.
 *
 * A cookie rather than the `state` parameter. State exists to be compared
 * against itself and nothing else; hanging a payload off it means the payload
 * travels through the provider and comes back as something a caller could have
 * rewritten. This never leaves us.
 *
 * Validated here as well as on the way out. The cookie is HttpOnly, so no page
 * can write one, but a value that was never allowed in is a value that cannot
 * come back out — and this is the exact shape of bug that #86 closed.
 */
export function rememberNext(request: Request, response: Response): void {
  const requested = typeof request.query.next === 'string' ? request.query.next : null;
  const next = safeRedirect(requested, '');

  if (!next) {
    // Clear rather than leave alone, or an abandoned sign-in would hand its
    // destination to the next one started in the same browser.
    response.clearCookie(NEXT_COOKIE, oauthCookieOptions());
    return;
  }

  response.cookie(NEXT_COOKIE, next, { ...oauthCookieOptions(), maxAge: OAUTH_COOKIE_TTL_MS });
}

/**
 * Read the destination back and spend it.
 *
 * Cleared whatever it said. It belongs to one sign-in, and a leftover would
 * silently redirect the next one somewhere its owner never asked for.
 */
export function takeNext(request: Request, response: Response): string {
  const cookies = request.cookies as Record<string, string> | undefined;
  const remembered = cookies?.[NEXT_COOKIE];

  response.clearCookie(NEXT_COOKIE, oauthCookieOptions());

  return safeRedirect(remembered, DEFAULT_NEXT);
}
