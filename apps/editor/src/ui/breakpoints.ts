/**
 * The widths at which on-canvas chrome changes shape, as an ordered ladder.
 *
 * Measured against the canvas rather than the window: the sidebar takes 16rem
 * off this side of the screen when it is open, and a panel that asked the
 * window how much room it had would keep its widest form in half a canvas.
 */
export const BREAKPOINT_WIDTHS = [0, 389, 436, 476, 580, 640, 840, 1023] as const;

/**
 * Names for the rungs above. A panel compares against one of these rather than
 * against a pixel count, so the widths stay in one place and two panels that
 * change at "the same size" actually do.
 */
export const BREAKPOINT = {
  ZERO: 0,
  MOBILE_XXS: 1,
  MOBILE_XS: 2,
  MOBILE_SM: 3,
  MOBILE: 4,
  TABLET_SM: 5,
  TABLET: 6,
  DESKTOP: 7,
} as const;

export type Breakpoint = (typeof BREAKPOINT)[keyof typeof BREAKPOINT];

/**
 * The rung a canvas of this width sits on.
 *
 * Anything past the last threshold falls through to DESKTOP, and so does a
 * canvas not measured yet (width 0) — the widest form is the right guess for
 * the frame before the first measurement, because most canvases are wide, and
 * guessing narrow would flash the chrome away and back on every load.
 */
export function getBreakpoint(width: number): Breakpoint {
  if (width <= 0) return BREAKPOINT.DESKTOP;

  // A width sits on the rung whose threshold it is the first to clear, so the
  // count of thresholds below it names the rung — one fewer, since the ladder
  // starts at zero.
  const rung = BREAKPOINT_WIDTHS.filter((threshold) => threshold < width).length - 1;
  return Math.min(rung, BREAKPOINT.DESKTOP) as Breakpoint;
}
