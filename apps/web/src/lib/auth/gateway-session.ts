import { errors, jwtVerify } from 'jose';
import { env } from '@/lib/env';

/**
 * The cookie the API gateway puts its short-lived access token in.
 *
 * Spelled out rather than imported: this module is pulled into the Edge
 * middleware bundle, and reaching into the gateway's source for one string
 * would drag a NestJS module graph along with it.
 */
export const ACCESS_COOKIE = 'cf.access';

export interface GatewaySession {
  userId: string;
  /** The `auth_sessions` row this was minted from, so it can be revoked. */
  sessionId: string;
}

const secret = new TextEncoder().encode(env.AUTH_SECRET);

/**
 * Read a gateway access token, or null if it is not a valid one.
 *
 * Verification only — no database, no network. That is what lets the Edge
 * middleware use this, and it is the point of a signed token: the signature is
 * the proof, so a page load does not have to ask anybody whether it is real.
 *
 * The trade is that a revoked session keeps working until the token expires,
 * which is why that window is fifteen minutes and why revocation lives on the
 * refresh side, where there is a row to mark.
 *
 * Null for every failure — expired, tampered with, signed by something else.
 * A caller has the same thing to do in each case.
 */
/**
 * What state an access token is in, for deciding where to send somebody.
 *
 * `readAccessToken` collapses every failure to null, which is right for
 * authorising a request. Routing needs one more distinction: a token that is
 * missing or expired may have a live session behind it and is worth sending to
 * the gateway to renew, while one that fails its signature never will be.
 * Sending the second kind to renew would loop — the gateway would mint a fresh
 * token, this app would reject it the same way, and send the browser back — so
 * it goes straight to the sign-in page instead.
 */
export type AccessTokenState = 'valid' | 'absent' | 'expired' | 'invalid';

export async function accessTokenState(token: string | undefined): Promise<AccessTokenState> {
  if (!token) return 'absent';

  try {
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.sub === 'string' && typeof payload.sid === 'string' ? 'valid' : 'invalid';
  } catch (error) {
    return error instanceof errors.JWTExpired ? 'expired' : 'invalid';
  }
}

/**
 * The gateway route that renews a session and sends the browser on to `next`.
 *
 * A URL, not a call: this app never sees the refresh cookie, so it cannot
 * renew anything itself. It hands the browser to the one place that can.
 */
export function resumeUrl(next: string): string {
  const url = new URL('/auth/resume', env.NEXT_PUBLIC_API_URL);
  url.searchParams.set('next', next);
  return url.toString();
}

export async function readAccessToken(token: string | undefined): Promise<GatewaySession | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}
