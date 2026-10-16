import { useEffect, useState } from 'react';
import { listWorkspaces } from '../workspace/workspace-api';

/**
 * Whether this browser is signed in to an account, for the board kept in it.
 *
 * The local board needs no account, so nothing waits on this: it only decides
 * whether the way out reads "Sign in" or "Your boards". Asked the way the
 * sidebar asks for the workspace list — the web app's own cookie answers, and
 * a 401 is the ordinary answer for someone who has no account here.
 *
 * Asked again whenever the window comes back into focus, so signing in from
 * another tab is noticed on returning to this one.
 *
 * Null until the first answer; false for any failure, network ones included,
 * since "Sign in" is the safe thing to offer when nothing is known.
 */
export function useSignedIn(enabled: boolean): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const ask = () => {
      listWorkspaces().then(
        () => {
          if (!cancelled) setSignedIn(true);
        },
        () => {
          if (!cancelled) setSignedIn(false);
        },
      );
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
