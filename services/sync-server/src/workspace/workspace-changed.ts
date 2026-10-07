import type { Hocuspocus } from '@hocuspocus/server';

/**
 * Sent to an open board when something about one of the person's workspaces
 * changed — its name, its boards, who is in it — so the editor re-reads what
 * it shows instead of waiting for a reload.
 *
 * It says which workspace and nothing else. The editor fetches the new state
 * through the routes that authorize it, so this message can never show anyone
 * something they could not already ask for.
 */
export interface WorkspaceChangedMessage {
  type: 'workspace-changed';
  workspaceId: string;
}

/**
 * Tell every open connection belonging to these people, on whatever board it
 * is, that the workspace changed. Returns how many connections were told.
 *
 * Reaches the connections this process holds, which is all of them while the
 * service runs as a single machine.
 */
export function announceWorkspaceChanged(
  server: Hocuspocus,
  workspaceId: string,
  userIds: ReadonlySet<string>,
): number {
  if (userIds.size === 0) return 0;

  const message = JSON.stringify({
    type: 'workspace-changed',
    workspaceId,
  } satisfies WorkspaceChangedMessage);

  let told = 0;
  for (const document of server.documents.values()) {
    for (const connection of document.getConnections()) {
      const { userId } = connection.context as { userId?: string };
      if (!userId || !userIds.has(userId)) continue;
      connection.sendStateless(message);
      told += 1;
    }
  }
  return told;
}
