import type { CursorColor } from '@canvasflow/types';
import { env } from '@/lib/env';

/**
 * Client for the web app's profile route.
 *
 * Cross-origin and credentialed, exactly like the share-link client: the editor
 * runs on its own origin and carries no session of its own, so the browser's
 * cookie for the web app is what authenticates. There is no id in the URL —
 * the session decides whose profile this is.
 */

export interface Profile {
  id: string;
  name: string;
  /** Null for a guest, whose stored address is a synthetic placeholder. */
  email: string | null;
  /** The provider's own photo, if they signed in with one. */
  avatarUrl: string | null;
  isGuest: boolean;
  /** Null means automatic: the colour is derived from the id instead. */
  cursorColor: CursorColor | null;
  /**
   * Changes with the photo, and null when there is none.
   *
   * Not a URL: photos live in private storage, so one is fetched against this
   * token rather than travelling as a link. See useAvatar.
   */
  avatarVersion: string | null;
  /**
   * Whether that photo is one uploaded here rather than a sign-in provider's.
   *
   * Only an uploaded photo is published to the board: providers issue a
   * generated letter-avatar for accounts that never set one, and that is not a
   * picture of anybody.
   */
  avatarUploaded: boolean;
}

export interface ProfileChanges {
  name?: string;
  /** Null goes back to the automatic colour. */
  cursorColor?: CursorColor | null;
}

function profileUrl(): string {
  return `${env.VITE_WEB_URL}/api/me`;
}

/**
 * Turn a failed response into something worth showing a person.
 *
 * The route's own message is preferred where there is one — it is the only
 * thing that knows *why* a name was refused.
 */
async function failureMessage(res: Response): Promise<string> {
  if (res.status === 401) return 'Sign in on the web app to change your profile.';
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Fall through to the generic message.
  }
  return `Something went wrong (${res.status}).`;
}

export async function fetchProfile(): Promise<Profile> {
  const res = await fetch(profileUrl(), { credentials: 'include' });
  if (!res.ok) throw new Error(await failureMessage(res));
  const body = (await res.json()) as { data: Profile };
  return body.data;
}

/**
 * Save whichever fields are passed, and take back the profile as it now stands.
 *
 * Answering with the whole record is what lets the dialog show the server's
 * version of a name — trimmed, and length-checked — rather than the text that
 * was typed.
 */
export async function saveProfile(changes: ProfileChanges): Promise<Profile> {
  const res = await fetch(profileUrl(), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error(await failureMessage(res));
  const body = (await res.json()) as { data: Profile };
  return body.data;
}
