import { createClient, resolveBoardAccess, type BoardAccess } from '@canvasflow/db';
import { env } from '@/lib/env';

const db = createClient(env.DATABASE_URL);

export type { BoardAccess };

/**
 * Whether this user may open this board, and in what capacity.
 *
 * A thin binding of the shared `resolveBoardAccess` to the web app's database
 * client. The rule itself — owner, then explicit board membership, then
 * workspace fallback, with an explicit revocation beating the fallback — lives
 * in @canvasflow/db so that this app, api-gateway and sync-server cannot drift
 * apart. They previously each carried their own copy with a comment asking the
 * next person to keep all three in sync by hand.
 *
 * Returns null for both "no such board" and "not allowed"; callers must answer
 * 404 to both so board ids can't be probed for existence.
 *
 * Note the role is a *board* role (owner/editor/viewer), not the workspace
 * role this used to return — it is what decides read-only access downstream.
 */
export async function checkBoardAccess(
  userId: string,
  boardId: string,
): Promise<BoardAccess | null> {
  return resolveBoardAccess(db, userId, boardId);
}
