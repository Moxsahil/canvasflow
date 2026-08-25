import { env } from '@/lib/env';

/**
 * Client for the web app's workspace routes.
 *
 * Cross-origin and credentialed, exactly like the share-link and token
 * routes: the editor carries no session of its own, so the browser's cookie
 * for the web app is what authenticates. The editor's own token is scoped to
 * one board and deliberately says nothing about the rest of the account.
 */

export type WorkspacePlan = 'free' | 'pro' | 'enterprise';
export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  plan: WorkspacePlan;
  logoUrl: string | null;
  /** The caller's role in the workspace, not on any board in it. */
  role: WorkspaceRole;
  boardCount: number;
}

/** The tag colours a board can carry. `gray` is what an untagged board has. */
export type BoardColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

export interface BoardSummary {
  id: string;
  workspaceId: string;
  title: string;
  visibility: 'private' | 'workspace' | 'public-link';
  color: BoardColor;
  /** ISO-8601, as JSON leaves it. */
  updatedAt: string;
}

/** A rename, a re-tag, or both. An absent field is left as it is. */
export interface BoardDetailsPatch {
  title?: string;
  color?: BoardColor;
}

/** Carries the status so callers can tell "not signed in" from "went wrong". */
export class WorkspaceApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'WorkspaceApiError';
    this.status = status;
  }
}

function workspacesUrl(path = ''): string {
  return `${env.VITE_WEB_URL}/api/workspaces${path}`;
}

function boardsUrl(path = ''): string {
  return `${env.VITE_WEB_URL}/api/boards${path}`;
}

/**
 * Turn a failed response into something worth showing a person.
 *
 * 404 covers both "no such thing" and "not yours" — that ambiguity is
 * deliberate on the server, so this doesn't try to undo it here. `subject`
 * only names what was asked for, since the routes answer for boards as well
 * as workspaces.
 */
async function failure(res: Response, subject: 'workspace' | 'board'): Promise<WorkspaceApiError> {
  if (res.status === 401) {
    return new WorkspaceApiError('Your session expired. Reload the board and try again.', 401);
  }
  if (res.status === 404) {
    return new WorkspaceApiError(`That ${subject} is no longer available.`, 404);
  }
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return new WorkspaceApiError(body.error, res.status);
  } catch {
    // Fall through to the generic message.
  }
  return new WorkspaceApiError(`Something went wrong (${res.status}).`, res.status);
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const res = await fetch(workspacesUrl(), { credentials: 'include' });
  if (!res.ok) throw await failure(res, 'workspace');
  const body = (await res.json()) as { data: WorkspaceSummary[] };
  return body.data;
}

export async function listWorkspaceBoards(workspaceId: string): Promise<BoardSummary[]> {
  const res = await fetch(workspacesUrl(`/${workspaceId}/boards`), { credentials: 'include' });
  if (!res.ok) throw await failure(res, 'workspace');
  const body = (await res.json()) as { data: BoardSummary[] };
  return body.data;
}

/**
 * Rename a workspace.
 *
 * Refused with 403 for a member who is neither owner nor admin — the switcher
 * hides the control for them, but the server is what actually decides.
 */
export async function renameWorkspace(
  workspaceId: string,
  name: string,
): Promise<WorkspaceSummary> {
  const res = await fetch(workspacesUrl(`/${workspaceId}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await failure(res, 'workspace');
  const body = (await res.json()) as { data: WorkspaceSummary };
  return body.data;
}

/** What a workspace took with it, so the caller can say so afterwards. */
export interface DeleteWorkspaceResult {
  boardsDeleted: number;
}

/** Delete a workspace and every board in it. Owner only, refused with 403. */
export async function deleteWorkspace(workspaceId: string): Promise<DeleteWorkspaceResult> {
  const res = await fetch(workspacesUrl(`/${workspaceId}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await failure(res, 'workspace');
  const body = (await res.json()) as { data: DeleteWorkspaceResult };
  return body.data;
}

export async function createWorkspace(name: string): Promise<WorkspaceSummary> {
  const res = await fetch(workspacesUrl(), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await failure(res, 'workspace');
  const body = (await res.json()) as { data: WorkspaceSummary };
  return body.data;
}

export async function createBoard(workspaceId: string, title?: string): Promise<BoardSummary> {
  const res = await fetch(workspacesUrl(`/${workspaceId}/boards`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(title ? { title } : {}),
  });
  if (!res.ok) throw await failure(res, 'workspace');
  const body = (await res.json()) as { data: BoardSummary };
  return body.data;
}

/**
 * Rename a board and/or re-tag it.
 *
 * The board is addressed directly rather than through its workspace: the
 * caller's right to edit it comes from the board, not from where it sits, and
 * a guest admitted by share link has no workspace to route through.
 */
export async function updateBoard(
  boardId: string,
  patch: BoardDetailsPatch,
): Promise<BoardSummary> {
  const res = await fetch(boardsUrl(`/${boardId}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await failure(res, 'board');
  const body = (await res.json()) as { data: BoardSummary };
  return body.data;
}

/**
 * Delete a board.
 *
 * Addressed directly, like the rename above, and held to a higher bar by the
 * server: the board's owner or an admin of its workspace, not merely someone
 * who may edit it. The returned summary is the board as it was, which is what
 * lets the caller name it in the message afterwards.
 */
export async function deleteBoard(boardId: string): Promise<BoardSummary> {
  const res = await fetch(boardsUrl(`/${boardId}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await failure(res, 'board');
  const body = (await res.json()) as { data: BoardSummary };
  return body.data;
}
