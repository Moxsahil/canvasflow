import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { jwtVerify, type JWTPayload } from 'jose';
import { isSessionLive } from '@canvasflow/db';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { ACCESS_COOKIE } from './auth-cookies.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  /**
   * The signed-in session the credential came from, when it names one. Absent
   * for a guest's board token. What lets a route act on "this device" — keep
   * it signed in, or mark it in a list — without a second credential.
   */
  sessionId?: string;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/**
 * Who is calling, from either credential this service accepts.
 *
 * Two of them, because they answer different questions and have different
 * lifetimes. The `Authorization: Bearer` token is minted per board and lasts
 * five minutes; the session cookie says which account is signed in and lasts
 * fifteen. Both are signed with the same secret, so the only thing that
 * differs is where they arrive and which claim names the account.
 *
 * Tried in that order. A Bearer token is an explicit credential for one call,
 * while a cookie is sent with everything, so the deliberate one should win
 * where both are present. An invalid Bearer falls through to the cookie
 * rather than failing the request: the board token is short-lived, and a
 * signed-in person whose token has just expired is still signed in.
 *
 * What a token must prove beyond its signature is up to each guard below.
 */
abstract class TokenGuard implements CanActivate {
  private readonly secret = new TextEncoder().encode(parseEnv().AUTH_SECRET);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const candidates = [tokenFromHeader(request), tokenFromCookie(request)].filter(
      (token): token is string => Boolean(token),
    );

    if (candidates.length === 0) {
      throw new UnauthorizedException('Missing authentication token');
    }

    for (const token of candidates) {
      const user = await this.read(token);
      if (user) {
        request.user = user;
        return true;
      }
    }

    throw new UnauthorizedException('Invalid or expired token');
  }

  /**
   * Read one token, or null if it is not one of ours.
   *
   * Null rather than a thrown error for every failure — expired, tampered
   * with, signed by something else — because the caller has another candidate
   * to try and telling the failures apart would only invite reporting which.
   */
  protected abstract read(token: string): Promise<AuthenticatedUser | null>;

  /** Who a token names, on its signature alone. Asks nothing of the database. */
  protected async verify(token: string): Promise<AuthenticatedUser | null> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.secret));
    } catch {
      return null;
    }

    // The session cookie names the account in `sub`, which is what the
    // registered claim is for. The board token predates it and uses `id`.
    // Both are read so neither credential has to be reissued.
    const id = typeof payload.sub === 'string' ? payload.sub : payload.id;
    if (typeof id !== 'string' || id.length === 0) return null;
    const sid = payload.sid;
    if (sid !== undefined && typeof sid !== 'string') return null;

    return {
      id,
      // Absent from a session token on purpose: a token is a credential, not
      // a profile, and a name baked into one goes stale the moment somebody
      // changes it. Whatever needs the profile reads the row.
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : undefined,
      sessionId: sid,
    };
  }
}

/**
 * The guard for anything that acts on an account or says something about it.
 *
 * A valid signature is not the whole answer. Any token that names a session
 * (`sid`) is honoured only while that session still stands, so signing out,
 * signing out everywhere or resetting a password takes effect on the very next
 * request instead of whenever the token in somebody's browser expires. A
 * guest's board token names no session and is judged on its signature alone,
 * as before.
 */
@Injectable()
export class JwtAuthGuard extends TokenGuard {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  protected async read(token: string): Promise<AuthenticatedUser | null> {
    const user = await this.verify(token);
    if (!user) return null;

    // One primary-key read, after the signature, so a forged or expired token
    // never costs a query. Deliberately outside the verification: a database
    // that cannot answer is an outage and surfaces as a 500, not as "not signed
    // in" — the editor treats repeated 401s as a session that has ended and
    // sends the person to sign in, which a blip must not do.
    if (user.sessionId !== undefined && !(await isSessionLive(this.database.db, user.sessionId))) {
      return null;
    }
    return user;
  }
}

/**
 * The guard for reads that neither act on the account nor reveal anything
 * about it, where asking whether the session still stands would cost a
 * database round trip to protect nothing. Whether a username is free is the
 * case in point: it is what any account could find out.
 *
 * The signature alone, so a session signed out in the last fifteen minutes
 * still passes. That is exactly why nothing that changes or discloses an
 * account may use this — those take `JwtAuthGuard`.
 */
@Injectable()
export class SignedTokenGuard extends TokenGuard {
  protected read(token: string): Promise<AuthenticatedUser | null> {
    return this.verify(token);
  }
}

function tokenFromHeader(request: Request): string | undefined {
  const auth = request.headers.authorization;
  if (!auth) return undefined;
  const [type, token] = auth.split(' ');
  return type === 'Bearer' ? token : undefined;
}

function tokenFromCookie(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, string> | undefined;
  return cookies?.[ACCESS_COOKIE];
}
