import { useEffect, useRef, useState } from 'react';
import { fetchVerificationStatus } from './verification-status';

/**
 * The quiet end of the 10 to 15 second window this is meant to poll on.
 *
 * Someone confirming in another tab waits at most this long to see the board
 * notice, which is well inside the time it takes them to switch back.
 */
const POLL_INTERVAL_MS = 15_000;

/**
 * Watch for an address being confirmed somewhere else.
 *
 * Polling, not pushing. Verification has to work when the collaboration
 * connection does not, so this deliberately does not ride on the Yjs socket;
 * an event layer can replace it later without authentication depending on one.
 *
 * There is no check on mount. The profile was just read and already carries
 * the answer, which is why the card is on screen at all, so an immediate
 * request would only ask a question we hold the answer to.
 *
 * @param enabled Whether the card is actually on screen. Nothing polls in the
 * background for a notice nobody can see.
 */
export function useVerificationStatus(
  token: string | null,
  enabled: boolean,
  onVerified?: () => void,
): boolean {
  const [verified, setVerified] = useState(false);

  // Through a ref so a caller passing this inline does not restart the timer
  // on every render.
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  useEffect(() => {
    if (!enabled || !token || verified) return;

    let cancelled = false;

    const check = async () => {
      try {
        const next = await fetchVerificationStatus(token);
        if (cancelled || !next) return;
        setVerified(true);
        onVerifiedRef.current?.();
      } catch {
        // A failed poll is not worth surfacing. This is a reminder, not a
        // gate, and the next tick asks again.
      }
    };

    const timer = setInterval(() => void check(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, token, verified]);

  return verified;
}
