import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The credential the web app presents when it calls this service directly.
 *
 * Derived from AUTH_SECRET rather than configured separately: the two
 * processes already have to share that secret to mint and verify editor
 * tokens, so a second one would be a second thing to rotate and a second way
 * for a deployment to be half-configured. Hashing it with a fixed purpose
 * string keeps this value useless anywhere else — it cannot be replayed as a
 * JWT signature, and a leak of it does not hand over the signing key.
 *
 * The web app derives the same value in `apps/web/src/lib/sync/internal.ts`.
 * Both must agree on PURPOSE; changing it here is a breaking change there.
 */

export const INTERNAL_AUTH_HEADER = 'x-canvasflow-internal';

const PURPOSE = 'canvasflow:internal:board-access:v1';

export function internalToken(authSecret: string): string {
  return createHmac('sha256', authSecret).update(PURPOSE).digest('hex');
}

/**
 * Constant-time comparison, because this runs on an unauthenticated route and
 * a fast reject leaks how much of a guess was right.
 */
export function isInternalCaller(presented: unknown, authSecret: string): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;

  const expected = Buffer.from(internalToken(authSecret), 'utf8');
  const given = Buffer.from(presented, 'utf8');
  if (expected.length !== given.length) return false;

  return timingSafeEqual(expected, given);
}
