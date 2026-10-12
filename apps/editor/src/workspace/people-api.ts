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

/** What a share link let somebody do on one board. */
export type GuestBoardRole = 'owner' | 'editor' | 'viewer';

export interface GuestBoard {
  boardId: string;
  title: string;
  role: GuestBoardRole;
}

/** Somebody on some of the workspace's boards by share link, without being in it. */
export interface WorkspaceGuest {
  userId: string;
  name: string;
  username: string | null;
  /** As for members, and always null for someone with no account. */
  email: string | null;
  /** Joined by link without an account. */
  isGuest: boolean;
  photo: string | null;
  boards: GuestBoard[];
}

/** What an invitation makes somebody. Never owner: a workspace has one. */
export type InvitableRole = 'admin' | 'member';

/** An invitation nobody has answered yet. */
export interface WorkspaceInvite {
  id: string;
  email: string;
  role: InvitableRole;
  invitedByName: string;
  /** ISO-8601, as JSON leaves them. */
  createdAt: string;
  expiresAt: string;
  lastSentAt: string;
  /** Its link has stopped working; sending it again starts another week. */
  expired: boolean;
}

export interface WorkspacePeople {
  /** The owner first, then admins, then members. */
  members: WorkspaceMember[];
  /** In the order they were first let onto a board. */
  guests: WorkspaceGuest[];
  /** Newest first. Only the owner and admins are told; empty for everyone else. */
  invites: WorkspaceInvite[];
}

/** An invitation just sent, and whether its email went. */
export interface SentInvite {
  invite: WorkspaceInvite;
  /** False when it was saved but the email did not go; sending again tries once more. */
  emailSent: boolean;
}

/**
 * A refusal from an invitation route, with the gateway's code when it sent
 * one — `already-invited`, `email-not-verified` — for a caller that does more
 * than show the sentence.
 */
export class InviteError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

function peopleUrl(workspaceId: string): URL {
  return new URL(`/workspaces/${workspaceId}/people`, env.VITE_API_URL);
}

async function failureMessage(res: Response): Promise<string> {
  return (await failure(res)).message;
}

/** Why a request failed, in words, with the gateway's code when it gave one. */
async function failure(res: Response, aboutOneInvite = false): Promise<InviteError> {
  if (res.status === 401) {
    return new InviteError('Your session expired. Reload the board and try again.', null);
  }
  if (res.status === 429) {
    return new InviteError('Too many tries at once. Wait a moment and try again.', null);
  }
  let body: { message?: unknown; code?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Fall through to the generic message.
  }
  const code = typeof body.code === 'string' ? body.code : null;
  // Not a member — or no longer one, or the workspace is gone. The gateway
  // does not say which, on purpose. A route about one invitation says what
  // 404 means there instead.
  if (res.status === 404) {
    return new InviteError(
      aboutOneInvite && typeof body.message === 'string'
        ? body.message
        : 'That workspace is no longer available to you.',
      code,
    );
  }
  if (typeof body.message === 'string' && body.message) return new InviteError(body.message, code);
  return new InviteError(`Something went wrong (${res.status}).`, code);
}

/** Everyone in the workspace, and everyone else on its boards. */
export async function listWorkspacePeople(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspacePeople> {
  const res = await fetch(peopleUrl(workspaceId), { credentials: 'include', signal });
  if (!res.ok) throw new Error(await failureMessage(res));
  const body = (await res.json()) as { data: WorkspacePeople };
  return body.data;
}

function invitesUrl(workspaceId: string, path = ''): URL {
  return new URL(`/workspaces/${workspaceId}/invites${path}`, env.VITE_API_URL);
}

/** Invite an address into the workspace. Rejects with an `InviteError`. */
export async function inviteToWorkspace(
  workspaceId: string,
  email: string,
  role: InvitableRole,
): Promise<SentInvite> {
  const res = await fetch(invitesUrl(workspaceId), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: SentInvite };
  return body.data;
}

/** Send an invitation again: a new link, a fresh week. */
export async function resendInvite(workspaceId: string, inviteId: string): Promise<SentInvite> {
  const res = await fetch(invitesUrl(workspaceId, `/${inviteId}/resend`), {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw await failure(res, true);
  const body = (await res.json()) as { data: SentInvite };
  return body.data;
}

/** Take an invitation back; its link stops working. */
export async function revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
  const res = await fetch(invitesUrl(workspaceId, `/${inviteId}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await failure(res, true);
}
