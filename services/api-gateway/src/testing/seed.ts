import { boardMembers, createWorkspaceForUser, memberships } from '@canvasflow/db';
import type { Gateway, TestAccount } from './gateway.js';

/**
 * Rows a test needs in place before it starts, written the way the app's own
 * code writes them. Each route under test then reads them back through the
 * real access checks.
 */

/** A team workspace owned by `owner`, with no boards yet. */
export async function createTeam(
  gateway: Gateway,
  owner: TestAccount,
  name = 'Team',
): Promise<string> {
  const workspace = await createWorkspaceForUser(gateway.db, { userId: owner.id, name });
  return workspace.id;
}

export async function addMember(
  gateway: Gateway,
  workspaceId: string,
  member: TestAccount,
  role: 'admin' | 'member' = 'member',
): Promise<void> {
  await gateway.db.insert(memberships).values({ workspaceId, userId: member.id, role });
}

/** Shares one board with someone outside its workspace, as a share link does. */
export async function shareBoard(
  gateway: Gateway,
  boardId: string,
  with_: TestAccount,
  role: 'editor' | 'viewer',
  grantedBy: TestAccount,
): Promise<void> {
  await gateway.db
    .insert(boardMembers)
    .values({ boardId, userId: with_.id, role, grantedBy: grantedBy.id });
}

/** A board in the workspace, made through the route the editor uses. */
export async function createBoard(
  account: TestAccount,
  workspaceId: string,
  title = 'Board',
): Promise<string> {
  const reply = await account.client.post<{ data: { id: string } }>(
    `/workspaces/${workspaceId}/boards`,
    { title },
  );
  if (reply.status !== 201) {
    throw new Error(`create board ${reply.status}: ${JSON.stringify(reply.body)}`);
  }
  return reply.body.data.id;
}
