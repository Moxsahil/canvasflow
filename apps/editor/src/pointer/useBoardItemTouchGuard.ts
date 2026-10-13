import { useEffect, type RefObject } from 'react';

/** What sits on the board rather than around it: link badges, comment pins, the padlock. */
const BOARD_ITEM = '[data-on-board]';

const onBoardItem = (target: EventTarget | null) =>
  target instanceof Element && target.closest(BOARD_ITEM) !== null;

/**
 * Safari's word for a pencil's touch. A pencil fires touch events as well as
 * pointer ones there, and it is the only browser that says which is which.
 */
const isStylusTouch = (touch: Touch) =>
  (touch as Touch & { touchType?: string }).touchType === 'stylus';

/**
 * In pen mode, a hand resting on the board can't press what sits on it.
 *
 * The canvas leaves touches out by itself, but the badges, pins and padlock
 * floating over it are buttons and links of their own: a palm lifting off a
 * link badge would follow the link, and one on the padlock would unlock the
 * shapes under it. Touches on them are stopped before they arrive. The pen,
 * the mouse, and a finger on the chrome around the board are left alone.
 */
export function useBoardItemTouchGuard(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;

    /** Touches that landed on a board item, followed until they lift. */
    const held = new Set<number>();

    const stopPointer = (e: PointerEvent) => {
      if (e.type === 'pointerdown') {
        if (e.pointerType !== 'touch' || !onBoardItem(e.target)) return;
        held.add(e.pointerId);
      } else if (!held.has(e.pointerId)) {
        return;
      }
      if (e.type === 'pointerup' || e.type === 'pointercancel') held.delete(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };

    // Cancelling the touch is what keeps a click from following it at all.
    const stopTouch = (e: TouchEvent) => {
      if (!onBoardItem(e.target)) return;
      if (Array.from(e.changedTouches).some(isStylusTouch)) return;
      e.preventDefault();
    };

    // Where the click comes anyway, it says what made it — in Chromium, at least.
    const stopClick = (e: MouseEvent) => {
      if (!(e instanceof PointerEvent) || e.pointerType !== 'touch') return;
      if (!onBoardItem(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const pointerEvents = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;
    for (const type of pointerEvents) root.addEventListener(type, stopPointer, true);
    root.addEventListener('touchstart', stopTouch, { capture: true, passive: false });
    root.addEventListener('click', stopClick, true);

    return () => {
      for (const type of pointerEvents) root.removeEventListener(type, stopPointer, true);
      root.removeEventListener('touchstart', stopTouch, true);
      root.removeEventListener('click', stopClick, true);
    };
  }, [rootRef, enabled]);
}
