/**
 * What a provider sign-in does to an account it found by address, with no
 * database in it, so every branch is reachable from a test rather than only
 * from an account that happens to be in the right state.
 */

export interface AddressMatchAccount {
  isGuest: boolean;
  disabledAt: Date | null;
  emailVerifiedAt: Date | null;
}

/**
 * - `refuse`: the provider has not confirmed the address. An address alone is
 *   not proof — GitHub lets anybody add any address to an account and only
 *   marks it confirmed once they follow a link — so linking on it would hand
 *   the account to whoever typed it in.
 * - `barred`: a guest or a barred account. Nothing about it is changed, and
 *   the sign-in refuses it.
 * - `link`: the address is confirmed on both sides, so the provider joins the
 *   account's other ways in.
 * - `claim`: nobody has confirmed the address here, so nothing proves that
 *   whoever set the account up owns it. Anybody can sign up with someone else's
 *   address and a password of their choosing, and signing in has never needed
 *   a confirmed address. The provider's confirmation is the first proof there
 *   is, so this person takes the account over, and every way in that was added
 *   before that proof — a password, an unconfirmed provider link, a signed-in
 *   device — is removed.
 */
export type AddressMatch = 'refuse' | 'barred' | 'link' | 'claim';

export function matchOnAddress(
  account: AddressMatchAccount,
  providerConfirmedAddress: boolean,
): AddressMatch {
  if (!providerConfirmedAddress) return 'refuse';
  if (account.isGuest || account.disabledAt) return 'barred';
  return account.emailVerifiedAt ? 'link' : 'claim';
}
