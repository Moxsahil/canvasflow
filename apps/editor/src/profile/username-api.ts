import { env } from '@/lib/env';
import type { Profile } from './profile-api';

/**
 * Client for the API gateway's username routes, at `users/me/username`.
 *
 * The session cookie is the credential, as it is for the web app's profile
 * route: the editor keeps it fresh by minting its board tokens through the
 * gateway. Cookie only, and on purpose for the check — a GET with no headers
 * of its own is a request the browser sends straight away, where an
 * `Authorization` header would make it ask permission first and double the
 * wait on every keystroke's answer.
 */

/** What the gateway says about one name it was asked about. */
export interface UsernameCheck {
  /** The name as it was asked about. */
  name: string;
  /** As it would be stored. Null when it breaks a rule. */
  username: string | null;
  available: boolean;
  /** Why it cannot be had: a rule it breaks, or that somebody has it. */
  problem: string | null;
}

function usernameUrl(): URL {
  return new URL('/users/me/username', env.VITE_API_URL);
}

/** The gateway's own sentence where it has one; it knows which rule was broken. */
async function failureMessage(res: Response): Promise<string> {
  if (res.status === 401) return 'Your session expired. Reload the board and try again.';
  if (res.status === 429) return 'Too many tries at once. Wait a moment and try again.';
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // Fall through to the generic message.
  }
  return `Something went wrong (${res.status}).`;
}

/**
 * Ask whether these names are free, in one request answered by one read.
 *
 * One name for the field as it is typed; a suggestion and its fallbacks
 * together. Answers come back in the order asked. They are only for the field
 * to show — the save is what decides.
 */
export async function checkUsernames(
  names: readonly string[],
  signal?: AbortSignal,
): Promise<UsernameCheck[]> {
  const url = usernameUrl();
  for (const name of names) url.searchParams.append('name', name);
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) throw new Error(await failureMessage(res));
  const body = (await res.json()) as { data: UsernameCheck[] };
  return body.data;
}

/** Claim a username, and take back the profile as it now stands. */
export async function claimUsername(username: string): Promise<Profile> {
  const res = await fetch(usernameUrl(), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error(await failureMessage(res));
  const body = (await res.json()) as { data: Profile };
  return body.data;
}
