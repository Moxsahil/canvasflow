import { isFrame, type Shape } from '../shapes/shape.js';
import { shapeBounds, rectContainsRect, rectsIntersect } from '../shapes/bounds.js';
import { frameHitAt } from '../frames/frame-geometry.js';
import {
  shapeContainsPoint,
  shapeExactOutline,
  shapeHasSolidInterior,
  shapeOutlineSegments,
} from '../shapes/outline.js';
import { arrowLabelLayout } from '../shapes/arrow-label.js';
import { arrowRenderPoints } from '../utils/rough.js';
import {
  pointSegmentDistance,
  segmentsIntersect,
  type Segment,
  type Vec2,
} from '../geometry/segment.js';
import type { Rect } from '../math.js';
import type { SpatialIndex } from '../spatial/spatial-index.js';

/**
 * How far from a shape's line a press may land and still be on it, in screen
 * pixels, for a mouse — which lands where it is aimed.
 */
export const HIT_MARGIN = 8;

/**
 * The same for a finger or a pencil, which land where the eye judged the line
 * to be, and a finger over a good deal more than one point of it.
 */
export const COARSE_HIT_MARGIN = 12;

/**
 * What a candidate is searched for around the point, beyond the margin: a
 * stroke's own thickness counts as on it, and isn't part of its bounds.
 */
const STROKE_REACH = 16;

/** Steps a curve is sampled in between two of its points. */
const CURVE_STEPS = 8;

export interface HitTestOptions {
  /** Screen pixels around a shape's line that still count as on it. */
  margin?: number;
  /**
   * What is selected, which answers anywhere inside the box drawn around it:
   * a selection is picked up by that box, not only by its lines, so a
   * diagonal arrow can be dragged by the space it spans.
   */
  selectedIds?: readonly string[];
}

/**
 * Where a press lands on one shape. `on` is on its line — or anywhere on a
 * shape that is solid all through, filled or text or an image. `inside` is
 * within the outline of a closed shape left unfilled.
 */
type ShapeHit = 'on' | 'inside' | null;

/**
 * Find the shape at (x, y). Returns null if nothing there.
 *
 * Judged by what is drawn, not by the box around it: a press has to land on a
 * shape's line, give or take the margin, or inside a closed one. A diagonal
 * line answers along its length and nowhere else in the corners of its box,
 * and a dead-straight one, whose box has no height at all, answers the margin
 * either side of it.
 *
 * Topmost first ("topmost" = last in the shapes array), and a line beats the
 * empty middle of a closed shape over it — that middle is see-through, and
 * what shows through it is what the press was aimed at. Inside several such
 * shapes and on none, the press goes to the smallest, the one it is plainly
 * in rather than one it happens also to be in. Failing all of that, to the
 * selection, if the press is inside the box around it.
 *
 * `zoom` turns the margin's screen pixels into the board's, and decides a
 * frame's border band, which has to stay grabbable at any scale.
 */
export function hitTest(
  shapes: readonly Shape[],
  index: SpatialIndex,
  x: number,
  y: number,
  zoom = 1,
  { margin = HIT_MARGIN, selectedIds }: HitTestOptions = {},
): Shape | null {
  const reach = margin / zoom;
  const pad = reach + STROKE_REACH;
  const candidateIds = new Set(
    index.searchRect({ x: x - pad, y: y - pad, width: pad * 2, height: pad * 2 }),
  );

  let hollow: { shape: Shape; area: number } | null = null;
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

    if (!candidateIds.has(shape.id)) continue;
    const hit = shapeHitAt(shape, x, y, reach);
    if (hit === 'on') return shape;
    if (hit === 'inside') {
      const b = shapeBounds(shape);
      const area = b.width * b.height;
      if (!hollow || area < hollow.area) hollow = { shape, area };
    }
  }
  if (hollow) return hollow.shape;
  return selectedIds && selectedIds.length > 0
    ? selectionAt(shapes, selectedIds, x, y, reach)
    : null;
}

/** The topmost selected shape, if (x, y) is inside the box around the selection. */
function selectionAt(
  shapes: readonly Shape[],
  selectedIds: readonly string[],
  x: number,
  y: number,
  reach: number,
): Shape | null {
  const selected = new Set(selectedIds);
  let top: Shape | null = null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    if (!selected.has(shape.id)) continue;
    top = shape;
    const b = shapeBounds(shape);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!top) return null;
  const inside = x >= minX - reach && x <= maxX + reach && y >= minY - reach && y <= maxY + reach;
  return inside ? top : null;
}

function shapeHitAt(shape: Shape, x: number, y: number, reach: number): ShapeHit {
  // Half a thick line is already on it, whatever the margin.
  const tolerance = Math.max(reach, shape.strokeWidth / 2);
  switch (shape.kind) {
    case 'text':
    case 'image':
    case 'embed':
    case 'bookmark': {
      const b = shapeBounds(shape);
      const inside =
        x >= b.x - reach &&
        x <= b.x + b.width + reach &&
        y >= b.y - reach &&
        y <= b.y + b.height + reach;
      return inside ? 'on' : null;
    }
    case 'rectangle':
    case 'ellipse':
    case 'diamond': {
      const outline = shapeExactOutline(shape) ?? [];
      if (nearPath(outline, true, x, y, tolerance)) return 'on';
      if (!shapeContainsPoint(shape, x, y)) return null;
      return shapeHasSolidInterior(shape) ? 'on' : 'inside';
    }
    case 'line':
    case 'freehand': {
      const points = absolutePoints(shape);
      const drawn =
        shape.kind === 'line' && shape.edges === 'round' ? curveThrough(points) : points;
      if (nearPath(drawn, false, x, y, tolerance)) return 'on';
      return shapeHasSolidInterior(shape) && shapeContainsPoint(shape, x, y) ? 'on' : null;
    }
    case 'arrow': {
      const points = arrowRenderPoints(shape);
      const drawn = shape.arrowType === 'curved' ? curveThrough(points) : points;
      if (nearPath(drawn, false, x, y, tolerance)) return 'on';
      // A caption sits in a break in the line and can stand well clear of it.
      const box = arrowLabelLayout(shape)?.box;
      return box && x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
        ? 'on'
        : null;
    }
    case 'frame':
      return null;
  }
}

/** Whether (x, y) is within `tolerance` of the path through these points. */
function nearPath(
  points: readonly Vec2[],
  closed: boolean,
  x: number,
  y: number,
  tolerance: number,
): boolean {
  const p: Vec2 = [x, y];
  if (points.length === 1) return Math.hypot(points[0]![0] - x, points[0]![1] - y) <= tolerance;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (pointSegmentDistance(p, a, b) <= tolerance) return true;
  }
  return false;
}

/**
 * The curve a rounded line or a curved arrow is drawn along, as close-set
 * points: the same spline through its points the renderer draws, each span a
 * cubic whose handles point along the line from the point before to the point
 * after.
 */
function curveThrough(points: readonly Vec2[]): Vec2[] {
  if (points.length < 3) return [...points];
  const out: Vec2[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1: Vec2 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Vec2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      out.push([
        a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0],
        a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1],
      ]);
    }
  }
  return out;
}

function absolutePoints(shape: {
  x: number;
  y: number;
  points: ReadonlyArray<readonly [number, number]>;
}): Vec2[] {
  return shape.points.map(([px, py]) => [shape.x + px, shape.y + py] as Vec2);
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
