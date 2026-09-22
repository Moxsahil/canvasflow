import { parseEnv } from '../../../config/env.js';
import type { OAuthErrorCode } from './oauth.service.js';

/**
 * Where somebody lands once the provider has answered.
 *
 * The origin is always `WEB_URL`, which is configuration. Only the path can
 * come from the request, and only after `safeRedirect` has reduced it to
 * something that cannot leave this site — see `oauth-next.ts`, which is the
 * one place that decides what a path is allowed to be.
 */
const FAILURE_PATH = '/login';

export function oauthSuccessUrl(nextPath: string): string {
  return new URL(nextPath, parseEnv().WEB_URL).toString();
}

export function oauthFailureUrl(code: OAuthErrorCode): string {
  const url = new URL(FAILURE_PATH, parseEnv().WEB_URL);
  url.searchParams.set('error', code);
  return url.toString();
}
