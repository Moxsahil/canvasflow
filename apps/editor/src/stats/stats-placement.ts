import { DOCK_CLEARANCE } from '../properties/halo-placement';

/** The strip's distance from the board's left and bottom edges, as the dock's and the zoom panel's. */
const EDGE = 16;
/** Kept between the strip and the dock when they share the bottom row. */
const GAP = 12;
/**
 * The room kept for the strip at its fullest: text selected, which adds a font
 * size to the four fields a box has.
 *
 * Its place is decided by this rather than by how wide it happens to be right
 * now. It grows and shrinks with every change of selection, and a bar that
 * hopped between two rows each time would be harder to find than one that
 * stays on the row the window has room for.
 */
export const STRIP_RESERVE = 560;

/**
 * How far above the board's bottom edge the stats strip sits.
 *
 * On the bottom row, in the corner left of the dock, when that corner is wide
 * enough to hold it. The dock is centred, so on a narrower board the corner is
 * not, and the strip stands on the row above instead — still against the left
 * edge, clear of the tools it would otherwise run into.
 */
export function stripBottom(boardWidth: number, dockWidth: number, stripWidth: number): number {
  const corner = (boardWidth - dockWidth) / 2 - EDGE - GAP;
  return corner >= Math.max(STRIP_RESERVE, stripWidth) ? EDGE : DOCK_CLEARANCE;
}
