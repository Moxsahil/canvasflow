import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Telling the sync-server that someone's access to a board just changed.
 *
 * Without this, a removal takes effect on a live session whenever the
 * sync-server's periodic sweep next comes round — up to five seconds of
 * someone drawing on a board they are no longer on. The sweep is still what
 * guarantees the change lands; this is what makes the case we can actually
 * observe, an owner clicking the button, take effect at once.
 *
 * Deliberately advisory. It carries no authority — the sync-server re-resolves
 * access from the database — and it is never awaited by the route that
 * triggers it, because an owner's removal must succeed whether or not this
 * service is reachable.
 */

const INTERNAL_AUTH_HEADER = 'x-canvasflow-internal';

/**
 * Must match `internalToken` in
 * `services/sync-server/src/security/internal-auth.ts` — including this
 * purpose string, which is what keeps the derived value useless as anything
 * other than a call to that one route.
 */
const PURPOSE = 'canvasflow:internal:board-access:v1';

function internalToken(): string {
  return createHmac('sha256', env.AUTH_SECRET).update(PURPOSE).digest('hex');
}

/** Give up rather than hold a request open for a service that is not answering. */
const TIMEOUT_MS = 2_000;

export async function notifyBoardAccessChanged(boardId: string, userId: string): Promise<void> {
  try {
    await fetch(new URL('/internal/board-access', env.SYNC_INTERNAL_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [INTERNAL_AUTH_HEADER]: internalToken(),
      },
      body: JSON.stringify({ boardId, userId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Nothing is broken by this failing: the sweep is the guarantee, and it
    // reaches the same connections within its interval. Logged rather than
    // rethrown so a sync-server restart can't fail an owner's removal.
    console.warn('Could not notify sync-server of an access change:', error);
  }
}
