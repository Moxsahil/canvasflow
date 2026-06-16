import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import { parseEnv } from '../../config/env.js';

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

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret = new TextEncoder().encode(parseEnv().AUTH_SECRET);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      const { payload } = await jwtVerify(token, this.secret);
      if (!payload.id || typeof payload.id !== 'string') {
        throw new UnauthorizedException('Invalid token payload');
      }
      request.user = {
        id: payload.id,
        email: (payload.email as string) ?? '',
        name: payload.name as string | undefined,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const auth = request.headers.authorization;
    if (!auth) return undefined;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
