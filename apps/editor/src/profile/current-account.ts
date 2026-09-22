import { env } from '@/lib/env';

/**
 * The account behind the current credential, as the database has it now.
 *
 * One request for everything a client rebuilds its state from after a reload,
 * and the authoritative answer rather than a remembered one. The access token
 * carries nothing but an id on purpose: a name or a verification flag baked
 * into a credential is a copy that keeps reporting the old value until the
 * token expires.
 */
export interface CurrentAccount {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  avatarVersion: string | null;
  /** Read live on every call. Never from a claim. */
  emailVerified: boolean;
  isGuest: boolean;
}

/**
 * Ask the gateway who this is.
 *
 * Sends both credentials it might have. The board token is explicit and goes
 * in the header when there is one; the session cookie rides along either way,
 * which is what keeps this working once the board token has expired and after
 * the editor stops minting them at all. The gateway prefers the header and
 * falls back to the cookie, so passing both is not ambiguous.
 */
export async function fetchCurrentAccount(token?: string | null): Promise<CurrentAccount> {
  const res = await fetch(`${env.VITE_API_URL}/users/me`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) throw new Error(`Account request failed (${res.status})`);

  const body = (await res.json()) as { data?: CurrentAccount };
  if (!body.data) throw new Error('Account response had no data');
  return body.data;
}
