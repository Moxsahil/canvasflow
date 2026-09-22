import { env } from '@/lib/env';
import { fetchCurrentAccount } from './current-account';

/**
 * Whether this account's address is confirmed, asked of the gateway.
 *
 * Reads the account endpoint rather than the narrower status one. Both answer
 * live from the database, so neither goes stale, but there is no reason for a
 * client to learn two URLs for two facts about one account — and this is the
 * one a reload rebuilds everything else from too.
 */
export async function fetchVerificationStatus(token: string): Promise<boolean> {
  const account = await fetchCurrentAccount(token);
  return account.emailVerified;
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
