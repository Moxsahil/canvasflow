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
 * `services/sync-server/src/security/internal-auth.ts` — including these
 * purpose strings, one per route, which are what keep each derived value
 * useless as anything other than a call to its own route.
 */
const BOARD_ACCESS_PURPOSE = 'canvasflow:internal:board-access:v1';
const WORKSPACE_CHANGED_PURPOSE = 'canvasflow:internal:workspace-changed:v1';

function internalToken(purpose: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(purpose).digest('hex');
}

/** Give up rather than hold a request open for a service that is not answering. */
const TIMEOUT_MS = 2_000;

export async function notifyBoardAccessChanged(boardId: string, userId: string): Promise<void> {
  try {
    await fetch(new URL('/internal/board-access', env.SYNC_INTERNAL_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [INTERNAL_AUTH_HEADER]: internalToken(BOARD_ACCESS_PURPOSE),
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

/**
 * Tell everyone in a workspace that it changed — renamed, deleted, or a board
 * in it added, renamed, deleted or shared — so their open editors re-read the
 * sidebar and Settings without a reload.
 *
 * `alsoTell` is for people the change has just taken out of the workspace,
 * who are no longer members for the sync-server to find.
 *
 * Advisory in the same way as the call above: it is never the only way the
 * change arrives — an editor re-reads when its window comes back into focus —
 * so a failure is logged and the route that called it still succeeds.
 */
export async function notifyWorkspaceChanged(
  workspaceId: string,
  alsoTell: readonly string[] = [],
): Promise<void> {
  try {
    await fetch(new URL('/internal/workspace-changed', env.SYNC_INTERNAL_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [INTERNAL_AUTH_HEADER]: internalToken(WORKSPACE_CHANGED_PURPOSE),
      },
      body: JSON.stringify({ workspaceId, userIds: alsoTell }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.warn('Could not notify sync-server of a workspace change:', error);
  }
}
