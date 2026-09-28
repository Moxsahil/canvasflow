/**
 * The checks that stand between a signed-in browser and deleting the account
 * behind it, kept apart from the routes so each can be tested on its own.
 *
 * Being signed in is not enough. A session left open on a shared computer must
 * not be able to erase somebody's work, so the person proves it is them again:
 * with their password, or — for an account that has none, and signs in only
 * with Google or GitHub — by having signed in moments ago, which the provider
 * only lets the real owner do.
 */

/** How long after signing in a provider-only account may still ask. */
export const RECENT_SIGN_IN_MS = 10 * 60 * 1000;

export type IdentityCheck = 'password' | 'recent-sign-in';

/**
 * A password wherever there is one, even on an account that can also use a
 * provider: it is the stronger proof, and the one the account chose.
 */
export function identityCheckFor(account: { passwordHash: string | null }): IdentityCheck {
  return account.passwordHash ? 'password' : 'recent-sign-in';
}

/**
 * When a sign-in stops counting as recent, or null when it already has — or
 * when the credential named no session, so there is no sign-in to go by.
 */
export function recentSignInUntil(signedInAt: Date | null, now: Date): Date | null {
  if (!signedInAt) return null;
  const until = new Date(signedInAt.getTime() + RECENT_SIGN_IN_MS);
  return until > now ? until : null;
}

/**
 * Whether what was typed is the account's address. Case and surrounding space
 * are forgiven, since addresses are compared that way everywhere else; nothing
 * else is.
 */
export function confirmsAddress(typed: string, email: string): boolean {
  const normalized = typed.trim().toLowerCase();
  return normalized.length > 0 && normalized === email.trim().toLowerCase();
}
