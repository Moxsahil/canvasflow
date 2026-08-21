import { useEffect, useRef, useState } from 'react';
import type { PresenceActivity } from '@canvasflow/canvas-engine';

/**
 * Report a user idle after this long without input. A minute is long enough to
 * read something on the board without being marked absent, and short enough
 * that a forgotten tab stops claiming attention.
 */
const IDLE_AFTER_MS = 60_000;

/**
 * Tracks whether this user is at the keyboard.
 *
 * Three states rather than two, because they come from different kinds of
 * evidence. `idle` is *inferred* from a timer. `away` is *known* — the
 * Visibility API says the tab is hidden. Guessing at a hidden tab with a timer
 * would take a full minute to reach a conclusion the browser hands over
 * instantly.
 *
 * Listens on `document`, not the canvas: someone adjusting the properties panel
 * or typing in a dialog is plainly still here, and a canvas-only listener would
 * call them idle.
 */
export function useIdleDetector(enabled: boolean): PresenceActivity {
  const [activity, setActivity] = useState<PresenceActivity>('active');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setActivity('active');
      return;
    }

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const markActive = () => {
      // Some browsers still deliver pointer events to a hidden tab; never let
      // one contradict what the Visibility API already told us.
      if (document.hidden) return;
      setActivity('active');
      clearTimer();
      timerRef.current = window.setTimeout(() => setActivity('idle'), IDLE_AFTER_MS);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        clearTimer();
        setActivity('away');
      } else {
        markActive();
      }
    };

    document.addEventListener('pointermove', markActive, { passive: true });
    document.addEventListener('pointerdown', markActive, { passive: true });
    document.addEventListener('keydown', markActive);
    document.addEventListener('visibilitychange', handleVisibility);

    // Establish the starting state from the browser rather than assuming:
    // a board can be opened in a background tab.
    handleVisibility();

    return () => {
      clearTimer();
      document.removeEventListener('pointermove', markActive);
      document.removeEventListener('pointerdown', markActive);
      document.removeEventListener('keydown', markActive);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled]);

  return activity;
}
