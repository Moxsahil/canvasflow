import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * The header the edge proxy adds to every request it forwards here.
 *
 * Set by a request-header rule at the edge, never by a client: the rule
 * overwrites whatever a caller sent under the same name, so a value arriving
 * through the proxy is always the configured one.
 */
export const ORIGIN_AUTH_HEADER = 'x-origin-auth';

/**
 * Paths answered without the header, because the host's own health checks
 * reach the machine directly and never pass through the edge. Both say only
 * whether the process and its database are up.
 */
const UNLOCKED_PATHS = new Set(['/health', '/healthz']);

/**
 * Refuse any request that did not come through the edge proxy.
 *
 * The service is reachable at two addresses: the public hostname, which the
 * proxy fronts, and the host's own `*.fly.dev` name, which goes straight to the
 * machine. `TRUST_PROXY_HOPS` is counted for the first path. On the second there
 * is one proxy fewer than it assumes, so the entry it believes was written by
 * the edge was written by the caller — who can then name any address they like
 * and start every per-IP limit from zero on each request. Rules configured at
 * the edge are skipped on that path too.
 *
 * Only the edge knows the secret, so only requests it forwarded carry it.
 * Refusing the rest closes the second path rather than trying to tell honest
 * entries in `X-Forwarded-For` from forged ones.
 *
 * Runs before anything else, body parsing included, so a refused request costs
 * one comparison. Both sides are hashed first because a constant-time compare
 * needs equal lengths, and comparing lengths first would leak the secret's.
 *
 * Without a secret it lets everything through: correct in development and in
 * tests, where nothing sits in front of the service.
 */
export function originLock(secret: string | undefined): RequestHandler {
  if (!secret) return (_req, _res, next) => next();

  const expected = digest(secret);

  return (req, res, next) => {
    if (UNLOCKED_PATHS.has(req.path)) return next();

    const presented = req.headers[ORIGIN_AUTH_HEADER];
    if (typeof presented === 'string' && timingSafeEqual(digest(presented), expected)) {
      return next();
    }

    // Deliberately says nothing about why. A caller on the direct path learns
    // only that it is closed, not which header would open it.
    res.status(403).json({ statusCode: 403, message: 'Forbidden', error: 'Forbidden' });
  };
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
