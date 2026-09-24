import type { OAuthProvider } from '../auth/oauth/oauth.service.js';

/**
 * The decisions behind password recovery, with no database in them, so every
 * branch is reachable from a test rather than only from an account that
 * happens to be in the right state.
 */

export interface ResetCandidate {
  isGuest: boolean;
  disabledAt: Date | null;
  passwordHash: string | null;
  /** Providers linked to the account, from `accounts`. */
  providers: OAuthProvider[];
}

/**
 * What a forgot-password request does for one account on the address.
 *
 * - `reset-link`: it has a password, so it gets a link to replace it.
 * - `provider-notice`: it signs in only through Google or GitHub. It gets a
 *   mail saying so, and no link — adding a password is something done while
 *   signed in, not something an email should do for them.
 * - `skip`: a guest (whose address is synthetic and never delivered to), a
 *   barred account, or one with no way in at all. Nothing is sent.
 *
 * None of this is ever visible to the caller: the reply is the same whatever
 * this returns.
 */
export type ResetAction = 'reset-link' | 'provider-notice' | 'skip';

export function resetActionFor(candidate: ResetCandidate): ResetAction {
  if (candidate.isGuest || candidate.disabledAt) return 'skip';
  if (candidate.passwordHash) return 'reset-link';
  if (candidate.providers.length > 0) return 'provider-notice';
  return 'skip';
}

export interface ResetTokenState {
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface ResetAccountState {
  isGuest: boolean;
  disabledAt: Date | null;
  passwordChangedAt: Date | null;
}

/**
 * Whether a reset link can still be used.
 *
 * `invalid` covers everything that is not simply out of time: spent, replaced
 * by a newer link, issued before the password last changed, or belonging to an
 * account that has since been barred. From the person's side those are the
 * same situation, and so is the fix — ask for a new link. Distinguishing them
 * would only tell whoever is holding someone else's link which it was.
 *
 * Spent is checked before expiry, so a link that was used and has since run
 * out still reads as used rather than inviting a retry.
 */
export type ResetTokenVerdict = 'valid' | 'expired' | 'invalid';

export function classifyResetToken(
  token: ResetTokenState,
  account: ResetAccountState,
  now: Date,
): ResetTokenVerdict {
  if (token.usedAt) return 'invalid';
  if (account.isGuest || account.disabledAt) return 'invalid';
  if (account.passwordChangedAt && token.createdAt < account.passwordChangedAt) return 'invalid';
  if (token.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}
