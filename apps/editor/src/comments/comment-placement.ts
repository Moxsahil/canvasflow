import type { Point } from '../machine/tool-machine.types';

/** The pin's marker, square, in screen pixels. It stands on its bottom-left corner. */
export const PIN_SIZE = 28;
/** Between a pin and the panel beside it. */
const GAP = 10;
/** Between a pin and the card that says what is in it. */
const PEEK_GAP = 6;
/** Kept between a panel and the edge of the board. */
const EDGE = 8;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Where a panel opened from a pin goes, in board pixels: the thread, or the
 * composer of one being placed.
 *
 * To the right of the pin, its top level with the pin's. On the left instead
 * when the right has no room for it, and nudged up or down to stay on the
 * board — a thread opened at the bottom edge should be readable where it is,
 * not need the board scrolled first.
 */
export function panelPlacement(
  pin: Point,
  panel: Size,
  board: Size,
): { left: number; top: number } {
  return beside(pin, panel, board, GAP, pin.y - PIN_SIZE);
}

/**
 * Where the card a pin shows while pointed at goes: beside the pin as a panel
 * would be, but standing on the pin's own baseline and rising from it, so it
 * reads as the pin's caption rather than as something opened.
 */
export function peekPlacement(pin: Point, card: Size, board: Size): { left: number; top: number } {
  return beside(pin, card, board, PEEK_GAP, pin.y - card.height);
}

function beside(
  pin: Point,
  panel: Size,
  board: Size,
  gap: number,
  top: number,
): { left: number; top: number } {
  const right = pin.x + PIN_SIZE + gap;
  const fitsRight = right + panel.width <= board.width - EDGE;
  const left = fitsRight ? right : pin.x - gap - panel.width;

  const lowest = board.height - EDGE - panel.height;
  return {
    left: Math.max(EDGE, Math.min(left, board.width - EDGE - panel.width)),
    top: Math.max(EDGE, Math.min(top, Math.max(EDGE, lowest))),
  };
}

/**
 * The part of the board a pin can be read in: clear of the row of buttons
 * along the top and of the toolbar along the bottom, and a little in from the
 * sides.
 */
const VIEW_INSET = { top: 64, right: 16, bottom: 72, left: 16 };

/**
 * Whether a pin is already in plain view: the whole of its marker, on the part
 * of the board the chrome leaves free.
 *
 * A thread picked from the list opens where its pin is when this holds, and
 * the board is only moved for a pin that is not there to be seen.
 */
export function isPinInView(pin: Point, board: Size): boolean {
  return (
    pin.x >= VIEW_INSET.left &&
    pin.x + PIN_SIZE <= board.width - VIEW_INSET.right &&
    pin.y - PIN_SIZE >= VIEW_INSET.top &&
    pin.y <= board.height - VIEW_INSET.bottom
  );
}

/** Whether a pin is near enough to the board to be worth drawing. */
export function isPinOnBoard(pin: Point, board: Size, margin = 120): boolean {
  return (
    pin.x >= -margin &&
    pin.y >= -margin &&
    pin.x <= board.width + margin &&
    pin.y <= board.height + margin
  );
}
