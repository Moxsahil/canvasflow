import type { Response } from 'express';
import { parseEnv } from '../../config/env.js';

/**
 * The two cookies a session lives in. Named like the existing `cf.guest` so
 * they are recognisable together in a browser's storage inspector.
 */
export const ACCESS_COOKIE = 'cf.access';
export const REFRESH_COOKIE = 'cf.refresh';

/** Scoped so the long-lived credential is sent to as few routes as possible. */
const REFRESH_COOKIE_PATH = '/auth';

export interface IssuedCredentials {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

function baseOptions() {
  const env = parseEnv();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    domain: env.SESSION_COOKIE_DOMAIN,
  };
}

/**
 * Put the two credentials where the browser will send them back.
 *
 * Both HttpOnly, so no script can read either, and both SameSite lax, which
 * blocks cross-site requests while still letting the editor on its own
 * subdomain carry them here: lax is about sites, and `app.canvasflowapp.com`
 * and `api.canvasflowapp.com` are the same site.
 *
 * The refresh cookie is scoped to `/auth` on purpose. It is the credential
 * worth stealing, and this keeps it off every ordinary API call rather than
 * sending it along with each one.
 *
 * Shared by password sign-in and by the OAuth callback, because a session has
 * to look identical however it was obtained. Two ways of setting it would be
 * two ways for it to drift.
 */
export function setSessionCookies(response: Response, credentials: IssuedCredentials): void {
  const shared = baseOptions();

  response.cookie(ACCESS_COOKIE, credentials.accessToken, {
    ...shared,
    path: '/',
    expires: credentials.accessTokenExpiresAt,
  });

  response.cookie(REFRESH_COOKIE, credentials.refreshToken, {
    ...shared,
    path: REFRESH_COOKIE_PATH,
    expires: credentials.refreshTokenExpiresAt,
  });
}

/**
 * Take both cookies away.
 *
 * Every attribute that identified the cookie has to match the one that set it,
 * path and domain included, or the browser treats it as a different cookie and
 * quietly keeps the original.
 */
export function clearSessionCookies(response: Response): void {
  const shared = baseOptions();

  response.clearCookie(ACCESS_COOKIE, { ...shared, path: '/' });
  response.clearCookie(REFRESH_COOKIE, { ...shared, path: REFRESH_COOKIE_PATH });
}
