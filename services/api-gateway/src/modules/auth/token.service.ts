import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { parseEnv } from '../../config/env.js';

/**
 * How long an access token is good for.
 *
 * Short on purpose. A signed token cannot be withdrawn before it expires, so
 * the window in which a stolen one still works is the only lever there is.
 * Revocation lives on the refresh side, where there is a row to mark.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenClaims {
  /** The account the token speaks for. */
  userId: string;
  /**
   * The session it was minted from.
   *
   * Carried so a token can be traced back to the row that can end it, which
   * is what lets a future check refuse tokens belonging to a revoked session
   * without waiting for them to expire.
   */
  sessionId: string;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

/**
 * Mints and reads the short-lived credential that authorises ordinary calls.
 *
 * Signed with the same secret the editor token and the existing guard already
 * use, so there is one signing key in this service rather than a second one to
 * rotate and to get half-configured.
 */
@Injectable()
export class TokenService {
  private readonly secret = new TextEncoder().encode(parseEnv().AUTH_SECRET);

  async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);

    const token = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.secret);

    return { token, expiresAt };
  }

  /**
   * Read a token, or null if it is not one of ours.
   *
   * Null rather than a thrown error for every failure — expired, tampered
   * with, signed by something else — because a caller has the same thing to do
   * in each case and telling them apart would only invite reporting which.
   */
  async read(token: string): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }
}
