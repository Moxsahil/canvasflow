import { env } from '@/lib/env';
import type { WorkspaceRole } from './workspace-api';

/**
 * Client for the API gateway's workspace routes — who is in a workspace, and
 * running it. Listing workspaces and their boards is the web app's; see
 * workspace-api.ts.
 *
 * The session cookie is the credential, as it is for the username routes, and
 * a GET carries no header of its own so the browser sends it without asking
 * permission first.
 */

/** One person in a workspace. */
export interface WorkspaceMember {
  userId: string;
  name: string;
  username: string | null;
  /** Only an owner or admin is told; null for everyone else. */
  email: string | null;
  role: WorkspaceRole;
  /** ISO-8601, as JSON leaves it. */
  joinedAt: string;
  /** Null draws the letters of their name. */
  photo: string | null;
}

function membersUrl(workspaceId: string): URL {
  return new URL(`/workspaces/${workspaceId}/members`, env.VITE_API_URL);
}

async function failureMessage(res: Response): Promise<string> {
  if (res.status === 401) return 'Your session expired. Reload the board and try again.';
  // Not a member — or no longer one, or the workspace is gone. The gateway
  // does not say which, on purpose.
  if (res.status === 404) return 'That workspace is no longer available to you.';
  if (res.status === 429) return 'Too many tries at once. Wait a moment and try again.';
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // Fall through to the generic message.
  }
  return `Something went wrong (${res.status}).`;
}

/** Everyone in the workspace: the owner first, then admins, then members. */
export async function listWorkspaceMembers(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceMember[]> {
  const res = await fetch(membersUrl(workspaceId), { credentials: 'include', signal });
  if (!res.ok) throw new Error(await failureMessage(res));
  const body = (await res.json()) as { data: WorkspaceMember[] };
  return body.data;
}
