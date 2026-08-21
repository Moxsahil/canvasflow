import { env } from '@/lib/env';

/**
 * Client for the web app's share-link routes.
 *
 * These are cross-origin and credentialed, exactly like the editor-token
 * refresh: the editor runs on its own origin and carries no session of its
 * own, so the browser's cookie for the web app is what authenticates.
 */

export type ShareRole = 'editor' | 'viewer';

export interface ShareLinkSummary {
  id: string;
  role: ShareRole;
  allowGuests: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  createdByName: string;
}

export interface CreatedShareLink {
  id: string;
  role: ShareRole;
  allowGuests: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  /** Only ever returned here — the server stores a hash and cannot reproduce it. */
  url: string;
}

export interface CreateShareLinkOptions {
  role?: ShareRole;
  allowGuests?: boolean;
  expiresInHours?: number | null;
  maxUses?: number | null;
}

function shareLinksUrl(boardId: string): string {
  return `${env.VITE_WEB_URL}/api/boards/${boardId}/share-links`;
}

/**
 * Turn a failed response into something worth showing a person.
 *
 * The routes answer 404 for "no such board" and "you may not touch this one"
 * alike, so this deliberately doesn't try to distinguish them — that ambiguity
 * is the point, and inventing a friendlier story here would undo it.
 */
async function failureMessage(res: Response): Promise<string> {
  if (res.status === 401) return 'Your session expired. Reload the board and try again.';
  if (res.status === 403) return 'Only the board owner can share this board.';
  if (res.status === 404) return 'This board is no longer available.';
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Fall through to the generic message.
  }
  return `Something went wrong (${res.status}).`;
}

export async function createShareLink(
  boardId: string,
  options: CreateShareLinkOptions = {},
): Promise<CreatedShareLink> {
  const res = await fetch(shareLinksUrl(boardId), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error(await failureMessage(res));
  return (await res.json()) as CreatedShareLink;
}

export async function listShareLinks(boardId: string): Promise<ShareLinkSummary[]> {
  const res = await fetch(shareLinksUrl(boardId), { credentials: 'include' });
  if (!res.ok) throw new Error(await failureMessage(res));
  const body = (await res.json()) as { data: ShareLinkSummary[] };
  return body.data;
}

export async function revokeShareLink(boardId: string, linkId: string): Promise<void> {
  const res = await fetch(`${shareLinksUrl(boardId)}/${linkId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await failureMessage(res));
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export type BoardRole = 'owner' | 'editor' | 'viewer';

export interface BoardMember {
  userId: string;
  name: string;
  email: string;
  isGuest: boolean;
  role: BoardRole;
  status: 'active' | 'revoked';
  isOwner: boolean;
}

function membersUrl(boardId: string): string {
  return `${env.VITE_WEB_URL}/api/boards/${boardId}/members`;
}

export async function listMembers(boardId: string): Promise<BoardMember[]> {
  const res = await fetch(membersUrl(boardId), { credentials: 'include' });
  if (!res.ok) throw new Error(await failureMessage(res));
  const body = (await res.json()) as { data: BoardMember[] };
  return body.data;
}

/**
 * Move someone between editor and viewer.
 *
 * Lands on their live session: the sync-server re-checks open connections on a
 * short interval, so a demoted editor loses the drawing tools within seconds
 * rather than at their next reconnect.
 */
export async function setMemberRole(
  boardId: string,
  userId: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  const res = await fetch(`${membersUrl(boardId)}/${userId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(await failureMessage(res));
}

/** Remove someone from the board entirely. Their socket is closed on the next sweep. */
export async function removeMember(boardId: string, userId: string): Promise<void> {
  const res = await fetch(`${membersUrl(boardId)}/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await failureMessage(res));
}
