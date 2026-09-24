/**
 * What password recovery carries between pages in this tab.
 *
 * `sessionStorage`, not the URL. An address in a query string ends up in
 * request logs, browser history and anything that records page views; the
 * reset token in the address bar is worse. sessionStorage is per tab, is gone
 * when the tab closes, and is never sent anywhere.
 *
 * Every access is wrapped: private windows and blocked storage throw, and the
 * flow has to keep working without the convenience.
 */

const EMAIL_KEY = 'cf:reset-email';
const TOKEN_KEY = 'cf:reset-token';

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Storage is unavailable; the person types the address again.
  }
}

/** The address typed on one auth page, offered on the next. */
export function rememberEmail(email: string): void {
  const trimmed = email.trim();
  write(EMAIL_KEY, trimmed.length > 0 ? trimmed : null);
}

export function rememberedEmail(): string {
  return read(EMAIL_KEY) ?? '';
}

/**
 * The reset token for this tab, from the link's fragment or from an earlier
 * visit in the same tab. A pure read, so it can back a render.
 */
export function currentResetToken(): string | null {
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get('token');
  return fromLink ?? read(TOKEN_KEY);
}

/**
 * Move the token out of the address bar.
 *
 * Kept for this tab so a reload still works, then removed from the URL so it
 * is not left in history, in a screenshot, or in a link somebody copies.
 * Called before any request is made from the page.
 */
export function stashResetToken(token: string): void {
  write(TOKEN_KEY, token);
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/** Once the link is spent or known to be dead, nothing should keep it. */
export function forgetResetToken(): void {
  write(TOKEN_KEY, null);
}

/**
 * `useSyncExternalStore` needs a subscription; these values only change when
 * this code changes them, so there is nothing to listen for.
 */
export function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * Start over when a reset link is opened in a tab already on the reset page.
 *
 * Only the fragment differs between two reset links — or between a link and
 * the same link opened again — and a browser treats a fragment-only change as
 * a jump within the page, not a new page. Without this, pasting a link into
 * that tab would load nothing, and the page would carry on showing whatever it
 * showed before: "Password updated." for a link that has in fact been spent.
 * A reload sends the new link through the ordinary first-load path.
 *
 * `replaceState` fires no `hashchange`, so moving a token out of the address
 * bar never triggers this. Returns the cleanup for an effect.
 */
export function restartOnNewResetLink(): () => void {
  const onChange = () => {
    if (new URLSearchParams(window.location.hash.slice(1)).has('token')) {
      window.location.reload();
    }
  };
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
