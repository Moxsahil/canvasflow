import type { Shape } from '../shapes/shape.js';
import { boundsContainPoints, shapeBounds, rectsIntersect } from '../shapes/bounds.js';
import type { Rect } from '../math.js';
import type { SpatialIndex } from '../spatial/spatial-index.js';

/**
 * Find the topmost shape at (x, y). Returns null if nothing there.
 *
 * "Topmost" = last in the shapes array (later = drawn on top of earlier).
 * Uses the spatial index for candidate filtering, then confirms hit
 * against actual bounds.
 */
export function hitTest(
  shapes: readonly Shape[],
  index: SpatialIndex,
  x: number,
  y: number,
): Shape | null {
  const candidateIds = new Set(index.searchPoint(x, y));
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (!shape) continue;
    if (candidateIds.has(shape.id) && boundsContainPoints(shape, x, y)) {
      return shape;
    }
  }
  return null;
}

export function hitTestMarquee(
  shapes: readonly Shape[],
  index: SpatialIndex,
  marquee: Rect,
): Shape[] {
  const candidateIds = new Set(index.searchRect(marquee));
  return shapes.filter((s) => {
    if (!candidateIds.has(s.id)) return false;
    return rectsIntersect(shapeBounds(s), marquee);
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
