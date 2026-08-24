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

export interface BoardSummary {
  id: string;
  workspaceId: string;
  title: string;
  visibility: 'private' | 'workspace' | 'public-link';
  /** ISO-8601, as JSON leaves it. */
  updatedAt: string;
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

/**
 * Turn a failed response into something worth showing a person.
 *
 * 404 covers both "no such workspace" and "not yours" — that ambiguity is
 * deliberate on the server, so this doesn't try to undo it here.
 */
async function failure(res: Response): Promise<WorkspaceApiError> {
  if (res.status === 401) {
    return new WorkspaceApiError('Your session expired. Reload the board and try again.', 401);
  }
  if (res.status === 404) {
    return new WorkspaceApiError('That workspace is no longer available.', 404);
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
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: WorkspaceSummary[] };
  return body.data;
}

export async function listWorkspaceBoards(workspaceId: string): Promise<BoardSummary[]> {
  const res = await fetch(workspacesUrl(`/${workspaceId}/boards`), { credentials: 'include' });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: BoardSummary[] };
  return body.data;
}

export async function createWorkspace(name: string): Promise<WorkspaceSummary> {
  const res = await fetch(workspacesUrl(), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await failure(res);
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
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: BoardSummary };
  return body.data;
}
