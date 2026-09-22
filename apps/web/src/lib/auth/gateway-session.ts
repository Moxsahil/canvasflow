import { jwtVerify } from 'jose';
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
