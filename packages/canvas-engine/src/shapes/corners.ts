/**
 * How far rounded corners are cut back, shared by what draws them and what
 * measures them — an arrow attached at a corner has to land on the curve the
 * shape is actually drawn with.
 */

/** A corner is cut back by this fraction of the shorter side or edge. */
export const CORNER_RADIUS_RATIO = 0.25;

/** And never further than this, in world units. */
export const MAX_CORNER_RADIUS = 32;

/** How far each corner of a box with round edges is cut back along both sides. */
export function roundedRectRadius(width: number, height: number): number {
  return Math.min(
    Math.min(Math.abs(width), Math.abs(height)) * CORNER_RADIUS_RATIO,
    MAX_CORNER_RADIUS,
  );
}

/**
 * How far a corner of a rounded polygon is cut back along its two edges: never
 * past the middle of either, or neighbouring corners would collide.
 */
export function polygonCornerCut(prevLength: number, nextLength: number): number {
  return Math.min(
    MAX_CORNER_RADIUS,
    prevLength / 2,
    nextLength / 2,
    prevLength * CORNER_RADIUS_RATIO,
  );
}
