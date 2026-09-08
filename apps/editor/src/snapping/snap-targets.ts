import {
  rectsIntersect,
  shapeBounds,
  type Point,
  type Rect,
  type Shape,
} from '@canvasflow/canvas-engine';

/**
 * How close two points have to come before they snap, in screen pixels.
 *
 * Screen rather than world, so the pull feels identical at every zoom: divide
 * by the zoom to get the distance in the units shapes are drawn in. Zoomed
 * right in, that is a fraction of a shape's width and the snap stays out of the
 * way of fine work; zoomed out, it reaches across what looks like the same
 * small distance on screen.
 */
export const SNAP_THRESHOLD_PX = 8;

export function snapThreshold(zoom: number): number {
  return SNAP_THRESHOLD_PX / zoom;
}

/**
 * The most shapes one gesture will consider.
 *
 * Gap detection compares every pair, so its cost is quadratic in this number.
 * The set is measured once when a gesture begins rather than on every pointer
 * move, and the viewport already bounds it — the cap only exists so that a
 * board with thousands of shapes in view cannot stall the first frame of a drag.
 */
const MAX_TARGETS = 400;

export interface SnapPointOptions {
  /** Corners of the bounding box. */
  readonly corners: boolean;
  /** The centre of each edge. */
  readonly midpoints: boolean;
}

/** The centre is always offered; the rest is up to the caller. */
export function boundsSnapPoints(bounds: Rect, options: SnapPointOptions): Point[] {
  const { x, y, width, height } = bounds;
  const right = x + width;
  const bottom = y + height;
  const cx = x + width / 2;
  const cy = y + height / 2;

  const points: Point[] = [{ x: cx, y: cy }];

  if (options.corners) {
    points.push({ x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom });
  }
  if (options.midpoints) {
    points.push({ x: cx, y }, { x: right, y: cy }, { x: cx, y: bottom }, { x, y: cy });
  }

  return points;
}

/**
 * What a shape offers to line up with.
 *
 * An ellipse and a diamond never reach the corners of their box, so snapping
 * something to one of those corners lines it up with empty space. Both offer
 * the centre of each edge instead — the four points their outline actually
 * passes through — whatever the midpoint preference says, since for them those
 * points are not an extra but the only honest answer.
 */
export function shapeSnapPoints(shape: Shape, midpoints: boolean): Point[] {
  const pointed = shape.kind === 'ellipse' || shape.kind === 'diamond';
  return boundsSnapPoints(shapeBounds(shape), {
    corners: !pointed,
    midpoints: midpoints || pointed,
  });
}

/**
 * Empty space between two shapes, measured along one axis.
 *
 * `start` and `end` bound the space itself; `overlapStart` and `overlapEnd`
 * bound the lane the two shapes share on the other axis, which is what decides
 * whether a third shape is in a position to care about this gap at all.
 */
export interface Gap {
  readonly start: number;
  readonly end: number;
  readonly length: number;
  readonly startBounds: Rect;
  readonly endBounds: Rect;
  readonly overlapStart: number;
  readonly overlapEnd: number;
}

/**
 * Every gap between shapes that share a lane, along one axis.
 *
 * Every pair is considered rather than only adjacent ones, so a gap measured
 * across an intervening shape is in the list too. That is deliberate: it costs
 * nothing to carry, and the nearest-offer rule downstream discards the ones
 * that were never plausible.
 */
export function gapsAlong(rects: readonly Rect[], axis: 'x' | 'y'): Gap[] {
  const horizontal = axis === 'x';
  const near = (r: Rect) => (horizontal ? r.x : r.y);
  const far = (r: Rect) => (horizontal ? r.x + r.width : r.y + r.height);
  const crossNear = (r: Rect) => (horizontal ? r.y : r.x);
  const crossFar = (r: Rect) => (horizontal ? r.y + r.height : r.x + r.width);

  const sorted = [...rects].sort((a, b) => near(a) - near(b));
  const gaps: Gap[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j]!;

      const start = far(a);
      const end = near(b);
      if (end <= start) continue;

      const overlapStart = Math.max(crossNear(a), crossNear(b));
      const overlapEnd = Math.min(crossFar(a), crossFar(b));
      if (overlapEnd <= overlapStart) continue;

      gaps.push({
        start,
        end,
        length: end - start,
        startBounds: a,
        endBounds: b,
        overlapStart,
        overlapEnd,
      });
    }
  }

  return gaps;
}

/** Everything one gesture can snap to, measured once at the point it begins. */
export interface SnapTargets {
  readonly points: readonly Point[];
  /** Gaps running left to right. */
  readonly horizontalGaps: readonly Gap[];
  /** Gaps running top to bottom. */
  readonly verticalGaps: readonly Gap[];
}

export const NO_SNAP_TARGETS: SnapTargets = {
  points: [],
  horizontalGaps: [],
  verticalGaps: [],
};

/**
 * Reduce the board to what the gesture about to start can line up with.
 *
 * Two exclusions matter. What is being moved is left out, or it would snap to
 * where it already is and never move again; and anything off screen is left
 * out, because a guide drawn to a shape nobody can see explains nothing and
 * measuring the whole board would make the cost of a drag depend on the size of
 * the document rather than on what is in front of you.
 */
export function buildSnapTargets(
  shapes: readonly Shape[],
  excluded: ReadonlySet<string>,
  viewport: Rect,
  options: { readonly midpoints: boolean },
): SnapTargets {
  const bounds: Rect[] = [];
  const points: Point[] = [];

  for (const shape of shapes) {
    if (excluded.has(shape.id)) continue;

    const shapeRect = shapeBounds(shape);
    if (!rectsIntersect(shapeRect, viewport)) continue;

    bounds.push(shapeRect);
    points.push(...shapeSnapPoints(shape, options.midpoints));

    if (bounds.length >= MAX_TARGETS) break;
  }

  return {
    points,
    horizontalGaps: gapsAlong(bounds, 'x'),
    verticalGaps: gapsAlong(bounds, 'y'),
  };
}

/** The world rectangle a viewport of this pixel size is looking at. */
export function worldViewport(
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
  width: number,
  height: number,
): Rect {
  return {
    x: camera.x,
    y: camera.y,
    width: width / camera.zoom,
    height: height / camera.zoom,
  };
}
