import { env } from '@/lib/env';

/**
 * Whether this account's address is confirmed, asked of the gateway.
 *
 * A separate client from profile-api for the same reason the avatar one is:
 * the profile's fields come from the web app's cookie-authenticated route,
 * while this goes to the gateway on the editor's bearer token.
 */
export async function fetchVerificationStatus(token: string): Promise<boolean> {
  const res = await fetch(`${env.VITE_API_URL}/users/me/verification-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Verification status request failed (${res.status})`);

  const body = (await res.json()) as { data?: { emailVerified?: boolean } };
  return body.data?.emailVerified === true;
}

export type ResendResult =
  | { status: 'sent' }
  | { status: 'not-sent' }
  | { status: 'already-verified' }
  | { status: 'rate-limited'; retryAfterSeconds: number };

/**
 * Ask for another verification link.
 *
 * Sends no body. The gateway reads the destination from the account behind the
 * token, which is what stops a signed-in caller aiming our mail at somebody
 * else's address.
 *
 * A 429 is an answer rather than a failure, so it is read instead of thrown:
 * the wait it carries is the only thing that can drive a useful countdown.
 */
export async function resendVerification(token: string): Promise<ResendResult> {
  const res = await fetch(`${env.VITE_API_URL}/auth/email/resend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 429) {
    throw new Error(`Resend request failed (${res.status})`);
  }

  const body = (await res.json()) as { data?: ResendResult };
  return body.data ?? { status: 'not-sent' };
}
