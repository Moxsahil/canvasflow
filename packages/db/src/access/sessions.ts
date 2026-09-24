import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { authSessions } from '../schema/auth-sessions.js';
import type { Database } from '../client.js';

/**
 * Whether a signed-in session still stands.
 *
 * A signed token proves who it was issued to and until when; it cannot say
 * that the session behind it has since been ended — signed out, signed out
 * everywhere, or swept away by a password reset. This is the check that can.
 * Every service that accepts a credential naming a session (`sid`) asks it,
 * so ending a session takes effect on the next request everywhere, rather than
 * when the token in somebody's browser happens to expire.
 *
 * One primary-key read. The expiry is compared too, so a session that simply
 * ran out answers the same as a revoked one.
 */
export async function isSessionLive(db: Database, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, sessionId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Which of these sessions still stand, in one query.
 *
 * For re-checking many open connections at once: one indexed read however many
 * connections there are, rather than one per connection.
 */
export async function liveSessionIds(db: Database, sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();

  const rows = await db
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(
      and(
        inArray(authSessions.id, [...new Set(sessionIds)]),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    );
  return new Set(rows.map((row) => row.id));
}
