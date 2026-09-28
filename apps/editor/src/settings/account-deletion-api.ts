import { env } from '@/lib/env';
import type { SignInProvider } from './account-security-api';

/**
 * Deleting your own account, from the API gateway.
 *
 * Sends both credentials the editor has, as Account & Security does: the board
 * token, which names the session the recent sign-in check goes by, and the
 * session cookie, which the gateway clears once the request has gone through.
 */

export interface DeletionPreview {
  /** What the person types to confirm. */
  email: string;
  /** A password where the account has one; otherwise a sign-in moments ago. */
  identityCheck: 'password' | 'recent-sign-in';
  /** Until when this sign-in counts as recent; null when it no longer does. */
  recentSignInUntil: string | null;
  graceDays: number;
  /** Boards the account owns that are not in the trash. */
  ownedBoards: number;
  /** Owned boards other people are members of: what they will lose. */
  sharedBoards: { id: string; title: string; members: number }[];
  /** Workspaces that stop deletion until somebody else takes them over. */
  sharedWorkspaces: { id: string; name: string }[];
}

export class AccountDeletionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The gateway's fixed name for the refusal, when it gives one. */
    readonly code?: string,
  ) {
    super(message);
  }
}

function request(path: string, token: string | null, init: RequestInit = {}) {
  return fetch(`${env.VITE_API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function failure(res: Response): Promise<AccountDeletionError> {
  const body = (await res.json().catch(() => null)) as {
    message?: string;
    code?: string;
  } | null;

  if (res.status === 401) {
    return new AccountDeletionError('Your session has ended. Sign in again.', 401);
  }
  if (res.status === 429) {
    return new AccountDeletionError(
      body?.message && !body.message.startsWith('ThrottlerException')
        ? body.message
        : 'Too many attempts. Wait a moment and try again.',
      429,
    );
  }
  return new AccountDeletionError(
    body?.message ?? `Something went wrong (${res.status}).`,
    res.status,
    body?.code,
  );
}

export async function fetchDeletionPreview(token: string | null): Promise<DeletionPreview> {
  const res = await request('/users/me/deletion', token);
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: DeletionPreview }).data;
}

/** What the person gave: the address they typed, and the password if one was asked for. */
export interface DeletionInput {
  confirmEmail: string;
  currentPassword?: string;
}

/**
 * Ask for the account to be deleted. Resolves with when the erasure runs; by
 * then every session has ended, this one included.
 */
export async function requestAccountDeletion(
  token: string | null,
  input: DeletionInput,
): Promise<{ purgeAfter: string }> {
  const res = await request('/users/me/deletion', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: { purgeAfter: string } }).data;
}

/**
 * Sign in again through a provider, landing back on a board.
 *
 * No `terms` on purpose. The pages that start a sign-in say that continuing
 * means agreeing to the terms, and pass the version they showed; this dialog
 * shows no terms, so it claims no agreement.
 */
export function signInAgainUrl(provider: SignInProvider): string {
  const url = new URL(`/auth/oauth/${provider}`, env.VITE_API_URL);
  url.searchParams.set('next', '/open');
  return url.toString();
}

/** The page that says when the erasure runs, on the web app. */
export function accountDeletedUrl(purgeAfter: string): string {
  const url = new URL('/account-deleted', env.VITE_WEB_URL);
  url.searchParams.set('until', purgeAfter);
  return url.toString();
}
