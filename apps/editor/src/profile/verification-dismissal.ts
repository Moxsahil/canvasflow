/**
 * Remembering that the "Confirm your email" card was dismissed, in this browser.
 *
 * Kept per account, so dismissing it for one account does not silence it for
 * whoever signs in on this machine next — and named by the account's id, never
 * its email address. Local storage outlives signing out, and anyone using the
 * browser afterwards can read it, so it must not list who has used CanvasFlow
 * here.
 */

const PREFIX = 'cf:verify-dismissed:';

const dismissedKey = (userId: string) => `${PREFIX}${userId}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private windows and blocked storage both land here.
    return null;
  }
}

export function wasDismissed(userId: string, store = storage()): boolean {
  try {
    return store?.getItem(dismissedKey(userId)) === '1';
  } catch {
    // Showing the card again is the harmless side to fail on.
    return false;
  }
}

export function rememberDismissed(userId: string, store = storage()): void {
  try {
    store?.setItem(dismissedKey(userId), '1');
  } catch {
    // Dismissing still works for this session, it just is not remembered.
  }
}

/**
 * Remove the markers earlier versions wrote, which were named by email
 * address. Each account whose address is still unconfirmed sees the card once
 * more, and dismissing it then is remembered by id.
 */
export function forgetDismissalsByEmail(store = storage()): void {
  if (!store) return;
  try {
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
    for (const key of keys) {
      if (key?.startsWith(PREFIX) && key.includes('@')) store.removeItem(key);
    }
  } catch {
    // Blocked storage: then nothing was written there either.
  }
}
