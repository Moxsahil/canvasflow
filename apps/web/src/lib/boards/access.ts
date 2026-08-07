import { createClient, boards, memberships } from '@canvasflow/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
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
 * Mirrors services/api-gateway/src/boards/boards.service.ts findByIdForUser
 * to keep authorization logic consistent across services. Any change to
 * one must be applied to the other.
 */
export async function checkBoardAccess(
  userId: string,
  boardId: string,
): Promise<BoardAccessResult | null> {
  // First: which workspaces is the user in, and what's their role in each?
  const userMemberships = await db
    .select({
      workspaceId: memberships.workspaceId,
      role: memberships.role,
    })
    .from(memberships)
    .where(eq(memberships.userId, userId));

  if (userMemberships.length === 0) return null;

  const workspaceIds = userMemberships.map((m) => m.workspaceId);

  // Then: does the board exist in one of those workspaces?
  const boardRows = await db
    .select({
      workspaceId: boards.workspaceId,
    })
    .from(boards)
    .where(
      and(
        eq(boards.id, boardId),
        inArray(boards.workspaceId, workspaceIds),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);

  const board = boardRows[0];
  if (!board) return null;

  // Find the role in the specific workspace
  const membership = userMemberships.find((m) => m.workspaceId === board.workspaceId);
  if (!membership) return null; // Defensive — shouldn't happen given the query above

  return {
    boardId,
    workspaceId: board.workspaceId,
    role: membership.role,
  };
}
