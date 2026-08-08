import { createClient, boards, memberships } from '@canvasflow/db';
import { and, eq, isNull } from 'drizzle-orm';
import { env } from '@/lib/env';

const db = createClient(env.DATABASE_URL);

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface BoardAccessResult {
  boardId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

/**
 * Check if a user has access to a specific board.
 * Returns board context (workspaceId, user's role) if authorized.
 * Returns null if the board doesn't exist OR the user has no access —
 * never distinguish the two, to prevent existence-leak side-channel.
 *
 * Uses a single JOIN query (memberships INNER JOIN boards) rather than
 * two sequential round trips. Matches the optimization made in
 * services/sync-server/src/auth/check-board-access.ts for consistency
 * across services.
 *
 * MIRRORS:
 *   - services/sync-server/src/auth/check-board-access.ts (identical contract)
 *
 * RELATED, but a DIFFERENT contract — do not assume these are interchangeable:
 *   - services/api-gateway/src/modules/boards/boards.service.ts
 *     (findByIdForUser returns a full BoardRow, not { workspaceId, role })
 *
 * TODO: Extract to a shared package (@canvasflow/board-access).
 * ANY CHANGE HERE MUST BE MIRRORED TO sync-server.
 */
export async function checkBoardAccess(
  userId: string,
  boardId: string,
): Promise<BoardAccessResult | null> {
  const rows = await db
    .select({
      workspaceId: boards.workspaceId,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(boards, eq(boards.workspaceId, memberships.workspaceId))
    .where(and(eq(memberships.userId, userId), eq(boards.id, boardId), isNull(boards.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    boardId,
    workspaceId: row.workspaceId,
    role: row.role,
  };
}
