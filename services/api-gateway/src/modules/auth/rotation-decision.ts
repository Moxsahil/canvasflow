/**
 * How long a session survives without being used.
 *
 * Sliding: every renewal pushes the expiry this far from now, so somebody who
 * opens CanvasFlow at least once a month is never asked to sign in again. Only
 * a session left untouched for the whole window lapses.
 */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The longest any one session can live, however active.
 *
 * What a sliding window gives up is a natural end: whoever holds a refresh
 * token can keep it alive by using it. This bounds that — one sign-in a year.
 */
export const ABSOLUTE_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * How soon after a token is spent a second presentation is forgiven.
 *
 * Two tabs can reach for the same token at once: both read the cookie before
 * either wrote its replacement, and the slower one arrives holding something
 * that was valid when it set off. That is a race, not a theft.
 */
export const REUSE_GRACE_MS = 10_000;

export interface SessionState {
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  recoveredAt: Date | null;
}

/**
 * What to do with a presented refresh token, before any writing begins.
 *
 * `spent` is not a conclusion — it means this token has been exchanged before,
 * and deciding what that implies needs one more fact from the database. See
 * `resolveSpent`.
 */
export type RotationVerdict = 'rotate' | 'raced' | 'invalid' | 'spent';

/**
 * Separated from the service on purpose.
 *
 * This is the judgement, with no database in it, which makes every branch
 * reachable from a test in a millisecond. It is also where the worst bug in
 * this area lived: the token used to be read before the session's own state,
 * so a session that had already been revoked raised a fresh theft alarm on
 * every retry and revoked itself again, burying any real one. The order below
 * is the fix, and the test that asserts a revoked session answers `invalid`
 * even while holding a spent token is what keeps it that way.
 */
export function classifyRotation(
  tokenUsedAt: Date | null,
  session: SessionState,
  now: number,
): RotationVerdict {
  // The session's own state decides first. A session that is over is over,
  // whatever the token it was presented with looks like.
  if (session.revokedAt) return 'invalid';
  if (session.expiresAt.getTime() <= now) return 'invalid';
  if (session.createdAt.getTime() + ABSOLUTE_SESSION_TTL_MS <= now) return 'invalid';

  if (!tokenUsedAt) return 'rotate';

  return now - tokenUsedAt.getTime() <= REUSE_GRACE_MS ? 'raced' : 'spent';
}

/**
 * What a spent token coming back actually means.
 *
 * Two very different things look identical here. Someone copied the credential
 * and both are using it — the case rotation exists to catch. Or the holder
 * never received the replacement: a dropped response, or a machine that lost
 * power before the browser wrote the new cookie down.
 *
 * `progressed` is what separates them: whether any later token in this session
 * has also been spent. If one has, two parties have been making progress. If
 * nothing after this one was ever used, the replacement went nowhere, and the
 * honest reading is that it never arrived.
 *
 * A session may be rescued once. A genuine undelivered response happens once;
 * two parties passing a session back and forth would look like this every
 * time, and each rescue would read exactly like the last.
 */
export function resolveSpent(progressed: boolean, recoveredAt: Date | null): 'reused' | 'recover' {
  return progressed || recoveredAt !== null ? 'reused' : 'recover';
}
