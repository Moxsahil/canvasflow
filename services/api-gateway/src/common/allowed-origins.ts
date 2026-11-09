import type { Env } from '../config/env.js';

/**
 * The origins this service will take a browser request from.
 *
 * One list, used by both the CORS policy and the checks that refuse a
 * cross-site form post. They answer the same question — is this one of ours —
 * and two copies would drift the first time a host changed, with the weaker
 * copy being the one that mattered.
 *
 * Localhost in development because the web app and the editor run on their own
 * ports there and neither is configured; the real hosts in production, where
 * both are. Outside production the configured hosts are admitted as well, so a
 * local stack on other ports (the end-to-end run) can talk to this service.
 */
const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:3002'];

export function allowedOrigins(env: Env): string[] {
  if (env.NODE_ENV !== 'production') {
    const configured = [env.WEB_URL, env.EDITOR_URL].filter((url): url is string => Boolean(url));
    return [...new Set([...DEV_ORIGINS, ...configured])];
  }
  return [env.WEB_URL, env.EDITOR_URL].filter((url): url is string => Boolean(url));
}

/**
 * Whether a state-changing request came from somewhere we accept.
 *
 * Browsers set `Origin` on every POST and script cannot forge it, so this is
 * the cheapest defence there is against a form on somebody else's site.
 *
 * A missing header passes. It is not a browser form, and whatever sent it
 * still had to present the credential it is spending — which is also what lets
 * this service be called server-to-server, where no Origin exists. The same
 * rule, for the same reason, as the web app's own logout route.
 */
export function isAllowedOrigin(origin: string | undefined, env: Env): boolean {
  if (origin === undefined || origin === null) return true;
  return allowedOrigins(env).includes(origin);
}
