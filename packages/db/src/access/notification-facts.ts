import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boardMembers, type BoardRole } from '../schema/board-access.js';
import { boards } from '../schema/boards.js';
import { users } from '../schema/users.js';
import { workspaceInvites } from '../schema/workspace-invites.js';
import { memberships, workspaces } from '../schema/workspaces.js';
import type { WorkspaceRole } from './workspaces.js';

/**
 * What an email about something that happened says, read back from the
 * database rather than taken from whoever reports it. A report only names the
 * event; these answer with what is true now, or null when it is not true at
 * all — the grant gone, the invitation never accepted — and nothing is sent.
 */

/** Somebody on a board by a grant, and who made the grant: the link's creator, for a join. */
export interface BoardJoinFacts {
  boardId: string;
  boardTitle: string;
  workspaceId: string;
  joinerId: string;
  joinerName: string;
  joinerIsGuest: boolean;
  role: BoardRole;
  grantedBy: string;
}

export async function boardJoinFacts(
  db: Database,
  boardId: string,
  userId: string,
): Promise<BoardJoinFacts | null> {
  const [row] = await db
    .select({
      boardTitle: boards.title,
      workspaceId: boards.workspaceId,
      joinerName: users.name,
      joinerIsGuest: users.isGuest,
      role: boardMembers.role,
      grantedBy: boardMembers.grantedBy,
    })
    .from(boardMembers)
    .innerJoin(boards, eq(boards.id, boardMembers.boardId))
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(
      and(
        eq(boardMembers.boardId, boardId),
        eq(boardMembers.userId, userId),
        eq(boardMembers.status, 'active'),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.grantedBy) return null;
  return { boardId, joinerId: userId, ...row, grantedBy: row.grantedBy };
}

/** An accepted workspace invitation: who sent it, who it let in, and as what. */
export interface WorkspaceJoinFacts {
  inviteId: string;
  workspaceId: string;
  workspaceName: string;
  invitedBy: string;
  joinerId: string;
  joinerName: string;
  role: WorkspaceRole;
}

export async function workspaceJoinFacts(
  db: Database,
  inviteId: string,
): Promise<WorkspaceJoinFacts | null> {
  const [row] = await db
    .select({
      workspaceId: workspaceInvites.workspaceId,
      workspaceName: workspaces.name,
      invitedBy: workspaceInvites.invitedBy,
      joinerId: workspaceInvites.acceptedBy,
      role: memberships.role,
      joinerName: users.name,
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .innerJoin(users, eq(users.id, workspaceInvites.acceptedBy))
    // Still in it: somebody who joined and was taken out again is not news.
    .innerJoin(
      memberships,
      and(
        eq(memberships.workspaceId, workspaceInvites.workspaceId),
        eq(memberships.userId, workspaceInvites.acceptedBy),
      ),
    )
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        isNotNull(workspaceInvites.acceptedAt),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.joinerId) return null;
  return { inviteId, ...row, joinerId: row.joinerId };
}

/** A workspace's name, or null when it is gone. */
export async function liveWorkspaceName(db: Database, workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
    .limit(1);
  return row?.name ?? null;
}

/** Somebody's name as an email would put it. Null for nobody. */
export async function personName(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name ?? null;
}
