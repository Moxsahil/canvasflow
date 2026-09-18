import type { NextResponse } from 'next/server';
import { createClient, getProfile } from '@canvasflow/db';
import { env } from '@/lib/env';
import { corsJson } from './cors';

const db = createClient(env.DATABASE_URL);

/**
 * Refuse an action until the caller has confirmed their address.
 *
 * Read from the database on every call rather than from the session. A session
 * minted before someone confirmed carries no record of it, so trusting the
 * token would keep refusing them until it expired — which is the trap of
 * letting a long-lived credential describe state that changes underneath it.
 *
 * Delegated to getProfile, the one place that knows what confirmed means,
 * including that a guest counts as confirmed because a synthetic address has
 * nothing to confirm. A guest cannot reach the routes this guards anyway,
 * since those require managing a board, but a second copy of that rule would
 * be a second thing to get wrong.
 *
 * Returns null when the caller may proceed and a response when they may not,
 * so a handler reads as:
 *
 *     const refusal = await requireVerified(userId, 'sharing a board');
 *     if (refusal) return refusal;
 *
 * @param action Named in the message, so the person is told which thing was
 * refused rather than being handed a bare denial.
 */
export async function requireVerified(
  userId: string,
  action: string,
): Promise<NextResponse | null> {
  const profile = await getProfile(db, userId);
  if (profile?.emailVerified) return null;

  return corsJson(
    {
      error: `Confirm your email address before ${action}. Check your inbox, or send yourself a new link from Settings.`,
      // So a caller can tell this apart from an ordinary permission failure
      // and point somewhere useful, rather than parsing the sentence above.
      code: 'email-not-verified',
    },
    { status: 403 },
  );
}
