import type { Env } from '../config/env.js';

const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:3002'];

/**
 * Build the list of allowed origins for WebSocket handshakes based on
 * environment. Dev always includes localhost. Prod adds env-configured
 * WEB_URL and EDITOR_URL.
 */
export function getAllowedOrigins(env: Env): string[] {
  const origins = [...DEV_ORIGINS];
  if (env.WEB_URL) origins.push(env.WEB_URL);
  if (env.EDITOR_URL) origins.push(env.EDITOR_URL);
  return origins;
}

/**
 * Compare origins with trailing-slash normalization.
 * A common bug: env var set to https://foo.com/ (with slash) doesn't
 * match browser-sent Origin header https://foo.com (no slash).
 * Learned during Sprint 2 deploy.
 */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  const normalized = origin.replace(/\/$/, '');
  return allowed.some((a) => a.replace(/\/$/, '') === normalized);
}
