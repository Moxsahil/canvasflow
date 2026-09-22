import { Injectable, ServiceUnavailableException, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { parseEnv } from '../../../config/env.js';
import { rememberNext } from './oauth-next.js';
import { GITHUB_STRATEGY } from './github.strategy.js';
import { GOOGLE_STRATEGY } from './google.strategy.js';

/**
 * Refuse before the redirect when a provider has no credentials.
 *
 * They are optional as a group so a checkout without them still serves every
 * other route. Without this check the strategy would send somebody to the
 * provider with a placeholder client id and let the provider's own error page
 * explain it, which is a confusing place to find out that a deployment is
 * missing configuration.
 *
 * Read per request rather than once at construction, so setting the secrets
 * and restarting is all it takes.
 *
 * Also the last point at which `?next=` can be seen. Passport takes over from
 * here and redirects, so the route handler never runs on the way out — this is
 * where the destination has to be put somewhere the callback can find it.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard(GOOGLE_STRATEGY) {
  override canActivate(context: ExecutionContext) {
    const env = parseEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    const http = context.switchToHttp();
    rememberNext(http.getRequest<Request>(), http.getResponse());

    return super.canActivate(context);
  }
}

@Injectable()
export class GitHubOAuthGuard extends AuthGuard(GITHUB_STRATEGY) {
  override canActivate(context: ExecutionContext) {
    const env = parseEnv();
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      throw new ServiceUnavailableException('GitHub sign-in is not configured');
    }

    const http = context.switchToHttp();
    rememberNext(http.getRequest<Request>(), http.getResponse());

    return super.canActivate(context);
  }
}
