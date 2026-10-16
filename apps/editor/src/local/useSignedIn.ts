import { useEffect, useState } from 'react';
import { findLandingBoard, forgetAccountHere, rememberAccountHere } from './landing';

/**
 * Whether this browser is signed in to an account, while the local board is
 * open anyway.
 *
 * Someone signed in normally never sees the local board: the editor's address
 * sends them to their own boards first (see App.tsx). This covers the ones it
 * cannot tell apart in advance — signed in on this browser without ever having
 * opened a board here — and decides whether the way out reads "Sign in" or
 * "Your boards". Nothing waits on it.
 *
 * The answer also sets the note that the address reads, so the next visit
 * goes straight to the account's boards, or straight to this board.
 *
 * Asked again whenever the window comes back into focus, so signing in from
 * another tab is noticed on returning to this one. Null until the first
 * answer; false for any failure, since "Sign in" is the safe thing to offer
 * when nothing is known.
 */
export function useSignedIn(enabled: boolean): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const ask = () => {
      void findLandingBoard().then((answer) => {
        if (answer.status === 'signed-in') rememberAccountHere();
        if (answer.status === 'signed-out') forgetAccountHere();
        if (!cancelled) setSignedIn(answer.status === 'signed-in');
      });
    };
    ask();
    window.addEventListener('focus', ask);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', ask);
    };
  }, [enabled]);

  return enabled ? signedIn : null;
}
