import { clientEnv } from '@/lib/env.client';

/**
 * Password recovery, called from the browser straight to the gateway.
 *
 * From the browser rather than through this app for the same reason sign-in
 * and signup are: the gateway limits these routes per IP, and proxying would
 * make every request in the product arrive from one address.
 */

const UNREACHABLE = 'Could not reach the server. Check your connection.';

async function post(path: string, body: unknown, credentials: RequestCredentials = 'omit') {
  return fetch(`${clientEnv.NEXT_PUBLIC_API_URL}${path}`, {
    method: 'POST',
    credentials,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export type RequestResetResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Ask for a reset link.
 *
 * Success says nothing about whether the address has an account — the gateway
 * answers every address the same way, and so must everything shown from this.
 */
export async function requestPasswordReset(email: string): Promise<RequestResetResult> {
  let response: Response;
  try {
    response = await post('/auth/password/forgot', { email });
  } catch {
    return { ok: false, error: UNREACHABLE };
  }

  if (response.ok) return { ok: true };

  const body = (await response.json().catch(() => null)) as {
    message?: string;
    retryAfterSeconds?: number;
  } | null;

  if (response.status === 429) {
    return {
      ok: false,
      error: 'Too many requests. Wait a moment, then try again.',
      retryAfterSeconds: body?.retryAfterSeconds,
    };
  }
  return { ok: false, error: body?.message ?? 'Something went wrong. Please try again.' };
}

export type ResetLinkState =
  | { state: 'valid'; email: string; expiresAt: string }
  | { state: 'expired' }
  | { state: 'invalid' }
  | { state: 'unreachable' };

/** Whether a link can still be used. Never spends it. */
export async function checkResetToken(token: string): Promise<ResetLinkState> {
  let response: Response;
  try {
    response = await post('/auth/password/reset/check', { token });
  } catch {
    return { state: 'unreachable' };
  }

  // A 400 here means the token was not even the right shape: as far as the
  // person is concerned, that link is simply not valid.
  if (!response.ok) {
    return response.status === 400 ? { state: 'invalid' } : { state: 'unreachable' };
  }

  const body = (await response.json().catch(() => null)) as {
    data?: { valid?: boolean; email?: string; expiresAt?: string; reason?: string };
  } | null;

  const data = body?.data;
  if (data?.valid && data.email && data.expiresAt) {
    return { state: 'valid', email: data.email, expiresAt: data.expiresAt };
  }
  return data?.reason === 'expired' ? { state: 'expired' } : { state: 'invalid' };
}

export type CompleteResetResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'invalid' | 'unreachable' }
  | { ok: false; reason: 'rejected'; error: string };

/**
 * Replace the password.
 *
 * `credentials: 'include'` so the gateway can clear this browser's session
 * cookies on the way out: every session was just ended, and a dead credential
 * left in the browser only means the next request fails the same way.
 */
export async function completePasswordReset(
  token: string,
  password: string,
): Promise<CompleteResetResult> {
  let response: Response;
  try {
    response = await post('/auth/password/reset', { token, password }, 'include');
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  const body = (await response.json().catch(() => null)) as {
    data?: { ok?: boolean; reason?: string };
    message?: string;
  } | null;

  if (response.ok) {
    if (body?.data?.ok) return { ok: true };
    return { ok: false, reason: body?.data?.reason === 'expired' ? 'expired' : 'invalid' };
  }

  if (response.status === 400) {
    return {
      ok: false,
      reason: 'rejected',
      error: body?.message ?? 'That password cannot be used. Try another.',
    };
  }
  if (response.status === 429) {
    return {
      ok: false,
      reason: 'rejected',
      error: 'Too many attempts. Wait a minute and try again.',
    };
  }
  return { ok: false, reason: 'unreachable' };
}
