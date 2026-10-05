import { Lock } from 'lucide-react';
import { menuChipClasses, menuSurfaceClasses } from '@/components/ui/menu-look';
import { cn } from '@/lib/utils';
import type { ScreenRect, Size } from '../properties/halo-placement';

/** Between the locked shape's top edge and the padlock. */
const GAP = 8;
/** Kept clear of the board's edges. */
const EDGE = 8;
/** The pill's height: a 28px chip in a hair of frame. */
const HEIGHT = 34;

/**
 * Where the padlock sits for locked shapes on screen, in board pixels: just
 * above their top-left corner, or just inside the top of the board when that
 * corner is scrolled up out of sight. Null when they are off screen.
 */
export function padlockPlacement(
  anchor: ScreenRect,
  board: Size,
): { left: number; top: number } | null {
  const onScreen =
    anchor.x + anchor.width > 0 &&
    anchor.x < board.width &&
    anchor.y + anchor.height > 0 &&
    anchor.y < board.height;
  if (!onScreen) return null;
  return {
    left: Math.max(EDGE, Math.min(anchor.x, board.width - EDGE - 96)),
    top: Math.max(EDGE, anchor.y - GAP - HEIGHT),
  };
}

/**
 * The way back into a locked shape someone has clicked: a padlock over its
 * corner that unlocks it and selects it.
 *
 * A click on a locked shape picks nothing, and without this it would look
 * like a board that had stopped answering. The padlock says why, and offers
 * the one thing that can be done about it there and then.
 */
export function LockPadlock({
  anchor,
  board,
  onUnlock,
}: {
  /** The locked shapes' box on the board. */
  anchor: ScreenRect;
  board: Size;
  onUnlock: () => void;
}) {
  const place = padlockPlacement(anchor, board);
  if (!place) return null;

  return (
    <div
      className={cn(menuSurfaceClasses, 'absolute z-(--zIndex-layerUI) rounded-card p-0.75')}
      style={{ left: place.left, top: place.top }}
      data-testid="lock-padlock"
    >
      <button
        type="button"
        title="Unlock"
        className={cn(menuChipClasses, 'gap-1.5 px-2')}
        onClick={onUnlock}
      >
        <Lock aria-hidden="true" />
        <span>Unlock</span>
      </button>
    </div>
  );
}
