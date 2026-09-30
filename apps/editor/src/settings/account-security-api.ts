import { env } from '@/lib/env';

/**
 * Account & Security, from the API gateway.
 *
 * Sends both credentials the editor has: the board token, which names the
 * account and the session it came from, and the session cookie, which the
 * gateway falls back to and which signing out everywhere has to clear.
 */

export type SignInProvider = 'google' | 'github';

export interface SessionSummary {
  id: string;
  device: string | null;
  location: string | null;
  signedInAt: string;
  lastActiveAt: string;
  current: boolean;
}

export interface AccountSecurity {
  email: string;
  hasPassword: boolean;
  passwordChangedAt: string | null;
  signedUpAt: string;
  providers: SignInProvider[];
  sessions: SessionSummary[];
}

/** What happened to the other devices when the password changed. */
export type SignedOut = 'other-devices' | 'nowhere' | 'everywhere';

export class AccountSecurityError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
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

/**
 * The gateway's own sentence where it has one — it knows which rule a password
 * broke — and a plain one where it does not.
 */
async function failure(res: Response): Promise<AccountSecurityError> {
  const body = (await res.json().catch(() => null)) as {
    message?: string;
    retryAfterSeconds?: number;
  } | null;

  if (res.status === 401) {
    return new AccountSecurityError('Your session has ended. Sign in again.', 401);
  }
  if (res.status === 429) {
    return new AccountSecurityError(
      body?.message && !body.message.startsWith('ThrottlerException')
        ? body.message
        : 'Too many attempts. Wait a moment and try again.',
      429,
      body?.retryAfterSeconds,
    );
  }
  return new AccountSecurityError(
    body?.message ?? `Something went wrong (${res.status}).`,
    res.status,
  );
}

export async function fetchAccountSecurity(token: string | null): Promise<AccountSecurity> {
  const res = await request('/users/me/security', token);
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: AccountSecurity }).data;
}

/**
 * The last answer, kept for as long as the page is open, and the request in
 * flight. The page is the account's: signing out or deleting leaves it, so
 * nothing kept here outlives the account it describes.
 */
let lastKnown: AccountSecurity | null = null;
let inFlight: Promise<AccountSecurity> | null = null;

/** What Account & Security last said, to show at once while it is read again. */
export function knownAccountSecurity(): AccountSecurity | null {
  return lastKnown;
}

/**
 * Reads Account & Security, sharing a request already under way rather than
 * starting a second one.
 */
export function loadAccountSecurity(token: string | null): Promise<AccountSecurity> {
  if (inFlight) return inFlight;
  const request = fetchAccountSecurity(token).then((data) => {
    lastKnown = data;
    return data;
  });
  inFlight = request;
  const settle = () => {
    if (inFlight === request) inFlight = null;
  };
  request.then(settle, settle);
  return request;
}

/**
 * Starts reading Account & Security before anyone asks, unless it is already
 * known, so the tab has it the moment it opens. A failure here is quiet: the
 * tab asks again, and says so if it fails there.
 */
export function warmAccountSecurity(token: string | null): void {
  if (lastKnown || inFlight) return;
  loadAccountSecurity(token).catch(() => {});
}

export async function changePassword(
  token: string | null,
  input: { currentPassword: string; newPassword: string; signOutOtherDevices: boolean },
): Promise<SignedOut> {
  const res = await request('/auth/password/change', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: { signedOut: SignedOut } }).data.signedOut;
}

export async function sendPasswordSetupLink(token: string | null): Promise<void> {
  const res = await request('/auth/password/setup-link', token, { method: 'POST' });
  if (!res.ok) throw await failure(res);
}

/**
 * Every session this account has, this one included. The gateway clears this
 * browser's cookies on the way out; the caller then sends the browser to sign in.
 */
export async function signOutEverywhere(token: string | null): Promise<void> {
  const res = await request('/auth/signout-all', token, { method: 'POST' });
  if (!res.ok && res.status !== 401) throw await failure(res);
}
