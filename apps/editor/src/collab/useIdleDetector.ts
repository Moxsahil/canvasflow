import { useEffect, useRef, useState } from 'react';
import type { PresenceActivity } from '@canvasflow/canvas-engine';

/**
 * Report a user idle after this long without pointer movement.
 *
 * Matches Excalidraw's threshold. A minute is long enough to survive reading
 * something on the board without being marked absent, and short enough that a
 * cursor left behind stops claiming attention.
 */
const IDLE_AFTER_MS = 60_000;

interface UseIdleDetectorOptions {
  /** Suspended while there is no connection to publish to. */
  enabled: boolean;
}

/**
 * Tracks whether this user is at the keyboard.
 *
 * Three states rather than two, because they come from genuinely different
 * signals: `idle` is inferred from a timer, while `away` is *known* — the
 * Visibility API says the tab is hidden. Guessing at a hidden tab with a timer
 * would take a minute to reach the same conclusion the browser hands us
 * immediately.
 *
 * Listens on `document` rather than the canvas: someone adjusting the
 * properties panel or typing in a dialog is plainly still present, and a
 * canvas-only listener would call them idle.
 */
export function useIdleDetector({ enabled }: UseIdleDetectorOptions): PresenceActivity {
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

    const armTimer = () => {
      clearTimer();
      timerRef.current = window.setTimeout(() => setActivity('idle'), IDLE_AFTER_MS);
    };

    const markActive = () => {
      // Never let a stray pointer event on a hidden tab (which some browsers
      // still deliver) contradict what the Visibility API told us.
      if (document.hidden) return;
      setActivity('active');
      armTimer();
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

    // Establish the starting state from the browser, not from an assumption:
    // the board can be opened in a background tab.
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
