import { useEffect, useRef } from 'react';

/**
 * "Part of your account changed somewhere else" — told to whatever shows that
 * part, so it re-reads.
 *
 * Two things say it. The sync-server, through the board's socket, the moment
 * another tab or device changes it. And the window coming back into focus
 * after a while away, since the socket only delivers what happens while it is
 * open.
 *
 * Carries which part and nothing else; listeners fetch it through the route
 * that authorizes them. Kept in step with ACCOUNT_PARTS in
 * `services/sync-server/src/account/account-changed.ts`.
 */
export type AccountPart = 'notifications';

type Listener = (part: AccountPart) => void;

const listeners = new Set<Listener>();

export function isAccountPart(value: unknown): value is AccountPart {
  return value === 'notifications';
}

export function announceAccountChanged(part: AccountPart): void {
  for (const listener of listeners) listener(part);
}

/** How long a window must have been away before coming back re-reads. */
const RETURN_AFTER_MS = 30_000;

let hiddenAt: number | null = null;
let watchingFocus = false;

/** Started by the first listener and left running: one handler for the life of the tab. */
function watchFocus(): void {
  if (watchingFocus || typeof document === 'undefined') return;
  watchingFocus = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt >= RETURN_AFTER_MS) {
      announceAccountChanged('notifications');
    }
    hiddenAt = null;
  });
}

/** Call `onChange` whenever this part of the account is said to have changed. */
export function useAccountChanges(part: AccountPart, onChange: () => void): void {
  // Held in a ref so a new callback each render does not resubscribe.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    watchFocus();
    const listener: Listener = (changed) => {
      if (changed === part) onChangeRef.current();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [part]);
}
