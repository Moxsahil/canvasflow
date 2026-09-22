'use client';

import { useEffect } from 'react';
import { refreshSession } from './api/signin';

/**
 * How often an open tab renews its access token.
 *
 * Comfortably inside the token's fifteen minutes, so a renewal that fails once
 * — a flaky connection, a redeploy — gets another attempt before the current
 * one lapses.
 */
const RENEW_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Keep an open tab signed in.
 *
 * The access token lasts fifteen minutes. Without this, a tab left open longer
 * than that bounces to the login page on the next navigation, holding a
 * perfectly good thirty-day session it never thought to spend.
 *
 * Renewing on a timer rather than on a failed request, because there is no one
 * place requests go through: the two apps between them make a couple of dozen
 * `fetch` calls, and retry logic sprinkled across all of them would be a
 * couple of dozen chances to get it subtly wrong. A timer is one place.
 *
 * Also on focus, because timers do not fire reliably in a background tab and
 * a laptop that was asleep comes back with an expired token either way.
 *
 * Failure is ignored on purpose. Whatever is next will be refused by the
 * middleware and redirect to sign-in, which is the same place this could send
 * them and a worse experience if the network merely hiccupped.
 */
export function SessionKeepalive() {
  useEffect(() => {
    const renew = () => {
      void refreshSession();
    };

    const timer = setInterval(renew, RENEW_INTERVAL_MS);

    const onFocus = () => {
      if (document.visibilityState === 'visible') renew();
    };
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return null;
}
