import { flushSync } from 'react-dom';

/** The edge the incoming theme sweeps out from. */
export type WipeDirection = 'left' | 'right';

const WIPE_DURATION_MS = 700;

/**
 * Where the incoming theme starts, as `inset(top right bottom left)`: clipped
 * flat against one edge, opening out to `inset(0 0 0 0)` — the whole window.
 */
const WIPE_FROM: Record<WipeDirection, string> = {
  left: 'inset(0 100% 0 0)',
  right: 'inset(0 0 0 100%)',
};

/**
 * A theme change is a whole-window repaint, and jumping between two of them is
 * jarring enough that people blink. The browser will hold a snapshot of the old
 * theme still while the new one is clipped open across it, which reads as one
 * surface being wiped rather than as two frames swapped.
 *
 * Nothing here is required for the theme to change: where view transitions are
 * unsupported, or the reader has asked for less motion, `apply` simply runs and
 * the swap is instant.
 */
export function wipeThemeChange(apply: () => void, direction: WipeDirection = 'left'): void {
  if (!canWipe()) {
    apply();
    return;
  }

  const transition = document.startViewTransition(() => {
    // Synchronously: the browser snapshots the DOM as this callback returns, so
    // a render React had scheduled for later would be captured as the old
    // theme and wiped in over itself.
    flushSync(apply);
  });

  transition.ready
    .then(() => {
      // The pseudo-element only exists once the transition is ready, and it is
      // animated rather than styled in CSS so the direction stays a decision of
      // the caller's.
      document.documentElement.animate(
        { clipPath: [WIPE_FROM[direction], 'inset(0 0 0 0)'] },
        {
          duration: WIPE_DURATION_MS,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {
      // `ready` rejects when a transition is skipped — by a second theme change
      // arriving mid-wipe, most often. The theme has still changed; only the
      // animation is dropped.
    });
}

function canWipe(): boolean {
  if (typeof document.startViewTransition !== 'function') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
