import { isFrame, type Shape } from '../shapes/shape.js';
import {
  boundsContainPoints,
  shapeBounds,
  rectContainsRect,
  rectsIntersect,
} from '../shapes/bounds.js';
import { frameHitAt } from '../frames/frame-geometry.js';
import { shapeOutlineSegments } from '../shapes/outline.js';
import { segmentsIntersect, type Segment } from '../geometry/segment.js';
import type { Rect } from '../math.js';
import type { SpatialIndex } from '../spatial/spatial-index.js';

/**
 * Find the topmost shape at (x, y). Returns null if nothing there.
 *
 * "Topmost" = last in the shapes array (later = drawn on top of earlier).
 * Uses the spatial index for candidate filtering, then confirms hit
 * against actual bounds.
 *
 * `zoom` only matters where a shape's hit region is chrome rather than
 * geometry — a frame's border band, which has to stay grabbable at any scale.
 */
export function hitTest(
  shapes: readonly Shape[],
  index: SpatialIndex,
  x: number,
  y: number,
  zoom = 1,
): Shape | null {
  const candidateIds = new Set(index.searchPoint(x, y));
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (!shape) continue;

    // A frame is hollow: only its border and label answer, so a click in the
    // middle carries on down to whatever is standing there — or to the board.
    //
    // Tested outside the spatial index, which only knows a shape's own bounds
    // and so would never offer a frame as a candidate for a click on the label
    // sitting above it. Boards hold few frames, and the border test that runs
    // first is a handful of comparisons.
    if (isFrame(shape)) {
      if (frameHitAt(shape, x, y, zoom)) return shape;
      continue;
    }

    if (candidateIds.has(shape.id) && boundsContainPoints(shape, x, y)) return shape;
  }
  return null;
}

/**
 * What a marquee has to do to a shape before it takes it.
 *
 * `wrap` takes only what it encloses; `overlap` takes anything it touches.
 * Neither is the right default for everyone — a board of overlapping shapes
 * wants the first, and one holding a few long arrows wants the second, since
 * an arrow spanning the whole board cannot be enclosed without zooming out
 * and losing your place.
 */
export type MarqueeMode = 'wrap' | 'overlap';

/** The four sides of a rect, as segments running clockwise from its origin. */
function rectEdges(r: Rect): Segment[] {
  const right = r.x + r.width;
  const bottom = r.y + r.height;
  return [
    [
      [r.x, r.y],
      [right, r.y],
    ],
    [
      [right, r.y],
      [right, bottom],
    ],
    [
      [right, bottom],
      [r.x, bottom],
    ],
    [
      [r.x, bottom],
      [r.x, r.y],
    ],
  ];
}

/**
 * The shapes a marquee selects.
 *
 * Three stages, cheapest first. The spatial index narrows the board to what is
 * near the box; enclosure answers for both modes without touching geometry;
 * and only a marquee that half-covers something in `overlap` pays for its
 * outline.
 *
 * That last stage is what keeps the box honest about shapes that do not fill
 * their own bounds. A diamond's corners and an ellipse's are empty, and a
 * diagonal line's box is mostly empty — testing bounds alone would take all
 * three from a marquee that never came near the mark on screen.
 */
export function hitTestMarquee(
  shapes: readonly Shape[],
  index: SpatialIndex,
  marquee: Rect,
  mode: MarqueeMode = 'overlap',
): Shape[] {
  const candidateIds = new Set(index.searchRect(marquee));
  if (candidateIds.size === 0) return [];

  const edges = rectEdges(marquee);

  return shapes.filter((shape) => {
    if (!candidateIds.has(shape.id)) return false;

    const bounds = shapeBounds(shape);
    if (rectContainsRect(marquee, bounds)) return true;
    if (mode === 'wrap') return false;

    // A frame is enclosed or nothing. It is hollow and usually the largest
    // thing on the board, so a box that merely clips one is far more likely to
    // be reaching for what stands inside it than for the frame itself.
    if (isFrame(shape)) return false;

    if (!rectsIntersect(bounds, marquee)) return false;

    for (const outline of shapeOutlineSegments(shape)) {
      for (const edge of edges) {
        if (segmentsIntersect(edge, outline)) return true;
      }
    }
    return false;
  });
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
