import { DOCK_CLEARANCE } from '../properties/halo-placement';

/** The strip's distance from the board's left and bottom edges, as the dock's and the zoom panel's. */
const EDGE = 16;
/** Kept between the strip and the dock when they share the bottom row. */
const GAP = 12;

/**
 * How far above the board's bottom edge the stats strip sits.
 *
 * On the bottom row, in the corner left of the dock, for as long as the strip
 * as it stands fits there. The dock is centred, so on a narrower board the
 * corner is not wide, and a strip that would run into the tools stands on the
 * row above instead — still against the left edge.
 *
 * It is the strip's own width that decides, not the most it could ever be. A
 * strip that left the bottom row with plain room still beside it — because a
 * panel opening had narrowed the board a little — read as a fault: the only
 * move anyone expects of it is out of the way of something it would touch.
 */
export function stripBottom(boardWidth: number, dockWidth: number, stripWidth: number): number {
  const corner = (boardWidth - dockWidth) / 2 - EDGE - GAP;
  return corner >= stripWidth ? EDGE : DOCK_CLEARANCE;
}
