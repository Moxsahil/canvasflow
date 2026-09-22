import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import { parseEnv } from '../../config/env.js';
import { ACCESS_COOKIE } from './auth-cookies.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
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
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
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
  private async read(token: string): Promise<AuthenticatedUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);

      // The session cookie names the account in `sub`, which is what the
      // registered claim is for. The board token predates it and uses `id`.
      // Both are read so neither credential has to be reissued.
      const id = typeof payload.sub === 'string' ? payload.sub : payload.id;
      if (typeof id !== 'string' || id.length === 0) return null;

      return {
        id,
        // Absent from a session token on purpose: a token is a credential, not
        // a profile, and a name baked into one goes stale the moment somebody
        // changes it. Whatever needs the profile reads the row.
        email: typeof payload.email === 'string' ? payload.email : '',
        name: typeof payload.name === 'string' ? payload.name : undefined,
      };
    } catch {
      return null;
    }
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
