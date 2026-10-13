import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The credential another of our own services presents when it calls this one
 * directly: an HMAC of a fixed purpose under AUTH_SECRET, as the sync-server
 * takes from this service and the web app. One purpose per route, so the value
 * for one is useless at another, and a leak of it is not the signing key.
 *
 * The web app derives the same value in `apps/web/src/lib/gateway/internal.ts`.
 */
export const INTERNAL_AUTH_HEADER = 'x-canvasflow-internal';

export const INTERNAL_PURPOSE = {
  notify: 'canvasflow:internal:notify:v1',
} as const;

/** Constant-time, because the route that asks is reachable by anyone. */
export function isInternalCaller(presented: unknown, secret: string, purpose: string): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(purpose).digest('hex'));
  const given = Buffer.from(presented);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
