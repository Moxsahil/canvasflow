import { env } from '@/lib/env';
import { t } from '../i18n';
import type { BoardSummary, WorkspaceRole } from './workspace-api';

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
  /** The owner's offer of the ownership, while it waits for an answer. */
  ownershipOffer: OwnershipOffer | null;
}

export interface OwnershipOffer {
  toUserId: string;
  /** ISO-8601. */
  offeredAt: string;
}

/** An invitation just sent, and whether its email went. */
export interface SentInvite {
  invite: WorkspaceInvite;
  /** False when it was saved but the email did not go; sending again tries once more. */
  emailSent: boolean;
}

/**
 * A refusal from a workspace route, with the gateway's code when it sent one —
 * `already-invited`, `email-not-verified`, `owner-must-hand-over` — for a
 * caller that does more than show the sentence.
 */
export class WorkspaceRequestError extends Error {
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
async function failure(res: Response): Promise<WorkspaceRequestError> {
  if (res.status === 401) {
    return new WorkspaceRequestError(t('errors.sessionExpired'), null);
  }
  if (res.status === 429) {
    return new WorkspaceRequestError(t('errors.tooManyTries'), null);
  }
  let body: { message?: unknown; code?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Fall through to the generic message.
  }
  const code = typeof body.code === 'string' ? body.code : null;
  // Not a member — or no longer one, or the workspace is gone. The gateway
  // does not say which, on purpose. A route about one invitation or one
  // person says what 404 means there instead.
  if (
    res.status === 404 &&
    (typeof body.message !== 'string' || body.message === 'Workspace not found')
  ) {
    return new WorkspaceRequestError(t('errors.workspaceGoneForYou'), code);
  }
  if (typeof body.message === 'string' && body.message)
    return new WorkspaceRequestError(body.message, code);
  return new WorkspaceRequestError(t('errors.status', { status: res.status }), code);
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

/** Invite an address into the workspace. Rejects with an `WorkspaceRequestError`. */
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
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: SentInvite };
  return body.data;
}

/** Take an invitation back; its link stops working. */
export async function revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
  const res = await fetch(invitesUrl(workspaceId, `/${inviteId}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await failure(res);
}

function workspaceUrl(workspaceId: string, path: string): URL {
  return new URL(`/workspaces/${workspaceId}${path}`, env.VITE_API_URL);
}

/** A change with nothing to read back; rejects with a `WorkspaceRequestError`. */
async function send(
  url: URL,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!res.ok) throw await failure(res);
  return res;
}

/** Make someone a member or an admin. */
export async function changeMemberRole(
  workspaceId: string,
  userId: string,
  role: InvitableRole,
): Promise<void> {
  await send(workspaceUrl(workspaceId, `/members/${userId}`), 'PATCH', { role });
}

/** What leaving or removing someone did with the boards they owned. */
export interface Departure {
  boardsPassed: number;
}

/** Take someone out of the workspace. */
export async function removeMember(workspaceId: string, userId: string): Promise<Departure> {
  const res = await send(workspaceUrl(workspaceId, `/members/${userId}`), 'DELETE');
  return ((await res.json()) as { data: Departure }).data;
}

/** Leave the workspace. Refused for the owner, who hands it over first. */
export async function leaveWorkspace(workspaceId: string): Promise<Departure> {
  const res = await send(workspaceUrl(workspaceId, '/leave'), 'POST');
  return ((await res.json()) as { data: Departure }).data;
}

/** Offer the ownership to another member. */
export async function offerOwnership(workspaceId: string, userId: string): Promise<void> {
  await send(workspaceUrl(workspaceId, '/ownership-offer'), 'POST', { userId });
}

/** Take the offer back, or — for the person offered it — turn it down. */
export async function withdrawOwnershipOffer(workspaceId: string): Promise<void> {
  await send(workspaceUrl(workspaceId, '/ownership-offer'), 'DELETE');
}

/** Accept the ownership one was offered. */
export async function acceptOwnership(workspaceId: string): Promise<void> {
  await send(workspaceUrl(workspaceId, '/ownership-offer/accept'), 'POST');
}

/** What a guest may do on a board. */
export type GuestRole = 'editor' | 'viewer';

/** Set what a guest may do on every board of the workspace they are on. */
export async function setGuestRole(
  workspaceId: string,
  userId: string,
  role: GuestRole,
): Promise<void> {
  await send(workspaceUrl(workspaceId, `/guests/${userId}`), 'PATCH', { role });
}

/** Take a guest off every board of the workspace they are on. */
export async function removeGuest(workspaceId: string, userId: string): Promise<void> {
  await send(workspaceUrl(workspaceId, `/guests/${userId}`), 'DELETE');
}

/** A board one was let onto by share link, outside one's own workspaces. */
export interface SharedBoard extends BoardSummary {
  workspaceName: string;
  ownerName: string;
  role: GuestBoardRole;
}

/**
 * The boards shared with the caller from workspaces they are not in, most
 * recently changed first — the sidebar's "Shared with you".
 */
export async function listSharedBoards(signal?: AbortSignal): Promise<SharedBoard[]> {
  const res = await fetch(new URL('/users/me/shared-boards', env.VITE_API_URL), {
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: SharedBoard[] }).data;
}
