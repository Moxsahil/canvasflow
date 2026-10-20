import type { Rect } from '../math.js';
import { pointSegmentDistance, type Segment, type Vec2 } from '../geometry/segment.js';
import { shapeBounds } from '../shapes/bounds.js';
import { shapeExactOutline } from '../shapes/outline.js';
import type { FreehandShape, LineShape, Shape } from '../shapes/shape.js';
import { strokeWidthOf } from '../shapes/shape.js';
import { visibleShapes } from '../shapes/visibility.js';
import { isPathALoop, simplifyPoints } from '../utils/simplify.js';

/**
 * The bucket fill: the closed area under a click, worked out from the
 * outlines on the board rather than from pixels.
 *
 * Every outline near the click is cut into straight segments, the segments
 * are split wherever they cross, and the result is walked into the closed
 * areas it divides the board into. The smallest one containing the click is
 * the fill. Working from outlines keeps the fill exact at every zoom and
 * leaves it an ordinary shape — a filled, strokeless line — that syncs,
 * exports and undoes like any other.
 *
 * The OWNER is the topmost closed, visible shape containing the click: a
 * rectangle, diamond, ellipse, frame, closed line or looped freehand stroke.
 * It is not the fill's boundary as such. It anchors the common case — only
 * outlines near its bounds are considered — and the editor takes the fill's
 * frame from it. With no owner (an area formed by open lines, or by a line
 * against the outside of a shape) the outlines come from a box around the
 * click that grows until the area found stops touching its edge. A previous
 * fill never owns: clicking one recolours it (the editor's job) or finds the
 * area again from the strokes around it.
 *
 * Outlines lying wholly inside the area become holes. They are spliced into
 * the returned ring along zero-width "keyhole" bridges, so the result is still
 * one closed polygon, and the doubled bridge cancels under the even-odd rule
 * rough uses to fill a polygon. Holes are spliced with the opposite winding,
 * so the path stays right under the nonzero rule as well.
 */

/**
 * How big a gap between strokes still counts as closed, in board units.
 *
 * A bridging radius, not a snapping one: a gap is closed by adding a short
 * edge from a loose stroke end to whatever it nearly meets, never by moving
 * a point, so a generous value here does not bend the filled shape.
 */
const GAP_TOLERANCE = 6;

/**
 * How far apart two fills' bounds may lie and still be the same area (see
 * `isRestylableFill`). Above the pipeline's own jitter — simplification at
 * about 0.75 and node merging at `snapEpsilon` — and below a typical stroke
 * width, so "the same area" matches what the user sees.
 */
const REGION_MATCH_TOLERANCE = 2;

/**
 * How deep inside a solid fill a stroke must lie before it counts as hidden
 * (see `clipSegmentToVisible`). A fill runs along the centre of the strokes
 * that bound it, so without this margin a fill would hide its own boundary
 * strokes from the next click and neighbouring areas would merge. A stroke on
 * the edge of a solid fill still shows its outer half.
 */
const COVER_MARGIN = 2;

/**
 * Largest gap, in board units, between a curved line's sampled path and the
 * curve the renderer draws. Lower hugs the curve tighter but feeds more
 * segments in; the result is simplified at about 0.75 anyway.
 */
const CURVE_MAX_DEVIATION = 0.5;

export interface FillRegionOptions {
  /**
   * Points closer than this merge into one, and a point this close to a
   * stroke splits it. Keep it small: every merge can move a point by up to
   * this much, so it bounds how far the fill may stray from the strokes.
   */
  readonly snapEpsilon: number;
  /**
   * Loose stroke ends this close to another stroke are bridged to it so the
   * area reads as closed. Also pads the search around the owner. Unlike
   * `snapEpsilon` this never moves a point, so it does not bend the fill.
   */
  readonly gapTolerance: number;
  /** Areas smaller than this are not fills. */
  readonly minArea: number;
  /** Give up as `too_complex` above this many outline segments. */
  readonly maxBoundarySegments: number;
  /** Most points a fill may have. */
  readonly maxGeneratedPoints: number;
  /**
   * Half the width of the first box searched when there is no owner. It
   * doubles up to three times while the area found touches the box's edge.
   */
  readonly fallbackSearchRadius: number;
}

export const DEFAULT_FILL_REGION_OPTIONS: FillRegionOptions = {
  snapEpsilon: 0.5,
  gapTolerance: GAP_TOLERANCE,
  minArea: 4,
  maxBoundarySegments: 2560,
  maxGeneratedPoints: 1536,
  fallbackSearchRadius: 512,
};

export type FillRegionFailure =
  /** No closed shape under the click and no area around it. Not worth a message. */
  | 'no_owner'
  /** Inside a shape, but its outline does not close. */
  | 'open_region'
  | 'too_complex'
  | 'too_small'
  | 'invalid_polygon';

/**
 * Where the fill goes in the layer order, relative to a shape already on the
 * board, so the caller can turn it into a key between two neighbours.
 */
export interface FillPlacement {
  readonly placement: 'above' | 'below';
  readonly shapeId: string;
}

export type FillRegionResult =
  | {
      readonly ok: true;
      /** The closed shape under the click, or null for an area formed by open lines. */
      readonly ownerId: string | null;
      /** Shapes other than the owner whose outlines bound the fill. */
      readonly boundaryIds: readonly string[];
      /**
       * The fill as a closed ring in board coordinates, its first point
       * repeated at the end. With holes it is a keyhole path: the holes are
       * spliced in along zero-width bridges.
       */
      readonly points: readonly Vec2[];
      readonly placement: FillPlacement;
    }
  | { readonly ok: false; readonly reason: FillRegionFailure };

// ---------------------------------------------------------------------------
// Small geometry
// ---------------------------------------------------------------------------

type Box = readonly [minX: number, minY: number, maxX: number, maxY: number];

const boxOfRect = (r: Rect): Box => [r.x, r.y, r.x + r.width, r.y + r.height];

const expandBox = ([x1, y1, x2, y2]: Box, pad: number): Box => [
  x1 - pad,
  y1 - pad,
  x2 + pad,
  y2 + pad,
];

const boxesIntersect = (a: Box, b: Box): boolean =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

function boxOfPoints(points: readonly Vec2[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Where `q` projects onto the line through a–b, as a fraction of a→b. */
function projectParam(a: Vec2, b: Vec2, q: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2;
}

const pointAtParam = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

function perpendicularDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return distance(p, a);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

/**
 * Where two segments cross, or null. Ends within `eps` of the other segment
 * count, so a stroke stopping on another one meets it. Parallel segments
 * return null; where they overlap, the T-junction pass joins them instead.
 */
function segmentIntersection(s1: Segment, s2: Segment, eps: number): Vec2 | null {
  const [a, b] = s1;
  const [c, d] = s2;
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denom;
  const p: Vec2 = [a[0] + t * rx, a[1] + t * ry];
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  if (pointSegmentDistance(p, a, b) > eps || pointSegmentDistance(p, c, d) > eps) return null;
  return p;
}

/**
 * Signed area by the shoelace formula. The face walk below traces every
 * closed area with a positive sign and every outside contour with a
 * negative one.
 */
function signedArea(ring: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
  }
  return sum / 2;
}

/** Point in polygon by the nonzero rule — spurs walked out and back cancel. */
function containsNonZero(ring: readonly Vec2[], [x, y]: Vec2): boolean {
  let winding = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j]!;
    const [x2, y2] = ring[i]!;
    const side = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
    if (y1 <= y) {
      if (y2 > y && side > 0) winding++;
    } else if (y2 <= y && side < 0) {
      winding--;
    }
  }
  return winding !== 0;
}

/** Point in polygon by the even-odd rule — the rule a fill is painted with. */
function containsEvenOdd(ring: readonly Vec2[], [x, y]: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from `p` to the closed ring's edges. */
function distanceToRing(ring: readonly Vec2[], p: Vec2): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    best = Math.min(best, pointSegmentDistance(p, ring[j]!, ring[i]!));
  }
  return best;
}

function ringSegments(ring: readonly Vec2[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    segments.push([ring[j]!, ring[i]!]);
  }
  return segments;
}

function pathSegments(path: readonly Vec2[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 1; i < path.length; i++) segments.push([path[i - 1]!, path[i]!]);
  return segments;
}

/**
 * Visit every grid cell of `cellSize` that the segment a–b, grown by
 * `inflate`, passes through — column by column, so a long diagonal visits the
 * cells it passes near rather than its whole bounding box.
 */
function forEachCellAlongSegment(
  a: Vec2,
  b: Vec2,
  inflate: number,
  cellSize: number,
  visit: (cx: number, cy: number) => void,
): void {
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fromCx = Math.floor((minX - inflate) / cellSize);
  const toCx = Math.floor((maxX + inflate) / cellSize);
  for (let cx = fromCx; cx <= toCx; cx++) {
    // The segment's vertical extent over this column.
    let y0 = a[1];
    let y1 = b[1];
    if (dx !== 0) {
      const t0 = (Math.max(minX, cx * cellSize - inflate) - a[0]) / dx;
      const t1 = (Math.min(maxX, (cx + 1) * cellSize + inflate) - a[0]) / dx;
      y0 = a[1] + t0 * dy;
      y1 = a[1] + t1 * dy;
    }
    const fromCy = Math.floor((Math.min(y0, y1) - inflate) / cellSize);
    const toCy = Math.floor((Math.max(y0, y1) + inflate) / cellSize);
    for (let cy = fromCy; cy <= toCy; cy++) visit(cx, cy);
  }
}

/** The `base` intervals with the `cuts` intervals taken out. */
function subtractIntervals(
  base: Array<[number, number]>,
  cuts: Array<[number, number]>,
): Array<[number, number]> {
  let result = base;
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [b0, b1] of result) {
      if (c1 <= b0 || c0 >= b1) {
        next.push([b0, b1]);
        continue;
      }
      if (c0 > b0) next.push([b0, c0]);
      if (c1 < b1) next.push([c1, b1]);
    }
    result = next;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** A colour's alpha, 0–1. Anything not understood reads as opaque. */
function colorAlpha(color: string | null): number {
  if (color === null) return 0;
  const c = color.trim().toLowerCase();
  if (c === '' || c === 'transparent' || c === 'none') return 0;
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 4) return parseInt(hex[3]! + hex[3]!, 16) / 255;
    if (hex.length === 8) return parseInt(hex.slice(6), 16) / 255;
    return 1;
  }
  const fn = /^(?:rgba?|hsla?)\((.*)\)$/.exec(c);
  if (fn) {
    const parts = fn[1]!.split(/[\s,/]+/).filter(Boolean);
    if (parts.length === 4) {
      const raw = parts[3]!;
      const value = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    }
  }
  return 1;
}

const isTransparentColor = (color: string | null): boolean => colorAlpha(color) <= 0;

// ---------------------------------------------------------------------------
// Shape outlines
// ---------------------------------------------------------------------------

/**
 * The path the renderer's curve draws through `points`: each span a cubic
 * whose handles lean on the points either side, sampled and then thinned to
 * within `CURVE_MAX_DEVIATION` of the curve.
 */
function curvePath(points: readonly Vec2[]): Vec2[] {
  if (points.length < 3) return [...points];
  const last = points[points.length - 1]!;
  const padded: Vec2[] = [points[0]!, ...points, last];
  const out: Vec2[] = [points[0]!];
  for (let i = 1; i + 2 < padded.length; i++) {
    const p0 = padded[i - 1]!;
    const p1 = padded[i]!;
    const p2 = padded[i + 1]!;
    const p3 = padded[i + 2]!;
    const c1: Vec2 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Vec2 = [p2[0] + (p1[0] - p3[0]) / 6, p2[1] + (p1[1] - p3[1]) / 6];
    const steps = Math.min(16, Math.max(1, Math.ceil(distance(p1, p2) / 4)));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
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
  return simplifyPoints(out, CURVE_MAX_DEVIATION);
}

function absolutePath(shape: LineShape | FreehandShape): Vec2[] {
  return shape.points.map(([px, py]) => [shape.x + px, shape.y + py] as Vec2);
}

/**
 * The centre of a line or freehand stroke as drawn: through its points, or
 * along the curve fitted to them when its edges are round. Rough draws the
 * stroke as two jittery passes around this path; a fill bounded by the path
 * itself straddles the stroke, the way a shape's own fill does.
 */
function strokePath(shape: LineShape | FreehandShape): Vec2[] {
  const path = absolutePath(shape);
  const drawn = shape.edges === 'round' && path.length > 2 ? curvePath(path) : path;
  // A gesture carries hundreds of points; thin them so a long scribble does
  // not use up the segment budget on its own.
  return shape.kind === 'freehand' ? simplifyPoints(drawn, CURVE_MAX_DEVIATION) : drawn;
}

/** Whether the path has at least three distinct points — enough to enclose anything. */
function enclosesArea(path: readonly Vec2[]): boolean {
  const distinct = new Set(path.map(([x, y]) => `${x}:${y}`));
  return distinct.size >= 3;
}

/**
 * Whether a line's stroke closes on itself. A filled straight-edged line is
 * drawn as a polygon, so its stroke runs back to the start; any line whose
 * ends nearly meet reads as closed too — the rule the renderer uses for
 * whether a stroke is a loop.
 */
function lineStrokeCloses(shape: LineShape): boolean {
  return (shape.fillColor !== null && shape.edges !== 'round') || isPathALoop(shape.points);
}

/** The kinds whose fill colour is actually painted. */
function paintsFillColor(shape: Shape): boolean {
  switch (shape.kind) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'frame':
    case 'line':
      return true;
    case 'freehand':
      return isPathALoop(shape.points);
    default:
      return false;
  }
}

/** The closed ring a shape's fill paints, or null when it paints none. */
function paintedArea(shape: Shape): Vec2[] | null {
  if (!paintsFillColor(shape) || isTransparentColor(shape.fillColor)) return null;
  return closedRing(shape, true);
}

/**
 * The closed ring a shape's outline makes, or null when it makes none.
 * `byFill` asks instead for the area its fill paints, which for a line is
 * closed whenever it is filled.
 */
function closedRing(shape: Shape, byFill = false): Vec2[] | null {
  switch (shape.kind) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return shapeExactOutline(shape);
    case 'frame': {
      const b = shapeBounds(shape);
      return [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x + b.width, b.y + b.height],
        [b.x, b.y + b.height],
      ];
    }
    case 'line': {
      const closes = byFill ? shape.fillColor !== null : lineStrokeCloses(shape);
      if (!closes) return null;
      const path = strokePath(shape);
      return enclosesArea(path) ? path : null;
    }
    case 'freehand': {
      if (!isPathALoop(shape.points)) return null;
      const path = strokePath(shape);
      return enclosesArea(path) ? path : null;
    }
    default:
      return null;
  }
}

/** The kinds whose outlines can bound a fill. Text, pictures, embeds and arrows cannot. */
const BOUNDARY_KINDS = new Set<Shape['kind']>([
  'rectangle',
  'diamond',
  'ellipse',
  'frame',
  'line',
  'freehand',
]);

const isInvisible = (shape: Shape): boolean => shape.opacity <= 0;

/** Whether the shape puts anything on screen at all. */
function rendersAnyMark(shape: Shape): boolean {
  if (isInvisible(shape)) return false;
  if (shape.kind === 'image' || shape.kind === 'embed' || shape.kind === 'bookmark') return true;
  if (!isTransparentColor(shape.strokeColor)) return true;
  return paintsFillColor(shape) && !isTransparentColor(shape.fillColor);
}

/**
 * Whether the shape paints a solid, fully opaque fill — one that hides the
 * outlines beneath it. Hatching, partial opacity and see-through colours all
 * let what is under them show.
 */
export function rendersOpaqueFill(shape: Shape): boolean {
  if (!paintsFillColor(shape) || shape.fillColor === null) return false;
  // A frame paints its fill flat whatever its fill style says.
  if (shape.kind !== 'frame' && shape.fillStyle !== 'solid') return false;
  if (shape.opacity < 100) return false;
  return colorAlpha(shape.fillColor) >= 1;
}

/**
 * Whether the shape is paint the bucket could have made: a closed line with a
 * visible fill and no visible stroke.
 *
 * Told apart by what it is, not by a marker. A marker would go stale the
 * moment someone restyled the fill, and a strokeless filled polygon drawn by
 * hand is the same thing anyway. Such paint never owns a fill; clicking it
 * recolours it instead (see `isRestylableFill`).
 */
export function isFillPaint(shape: Shape): shape is LineShape {
  return (
    shape.kind === 'line' &&
    !isInvisible(shape) &&
    !isTransparentColor(shape.fillColor) &&
    isTransparentColor(shape.strokeColor) &&
    lineStrokeCloses(shape) &&
    enclosesArea(absolutePath(shape))
  );
}

/**
 * Whether the shape's outline can stop a fill. Decided by what shows, not by
 * where the shape came from: a fill someone has given a visible stroke bounds
 * new fills like any other outline.
 */
const isEligibleBoundary = (shape: Shape): boolean =>
  !isInvisible(shape) && BOUNDARY_KINDS.has(shape.kind) && !isTransparentColor(shape.strokeColor);

/** The shape's outline as segments, each a single clean pass. */
function boundarySegments(shape: Shape, snapEpsilon: number): Segment[] {
  if (shape.kind === 'line' || shape.kind === 'freehand') {
    const path = strokePath(shape);
    const segments = pathSegments(path);
    // A loop whose ends stop a little short of each other is drawn — and
    // filled — as closed, but its segments leave that gap open. Close it here
    // by the renderer's own rule, not by the gap tolerance, so what reads as
    // closed and what the fill treats as closed agree.
    const closes = shape.kind === 'line' ? lineStrokeCloses(shape) : isPathALoop(shape.points);
    if (closes && segments.length > 0) {
      const first = path[0]!;
      const last = path[path.length - 1]!;
      if (distance(first, last) >= snapEpsilon) segments.push([last, first]);
    }
    return segments;
  }
  const ring = closedRing(shape);
  return ring ? ringSegments(ring) : [];
}

function findOwner(point: Vec2, shapes: readonly Shape[]): { shape: Shape; ring: Vec2[] } | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i]!;
    // Earlier fills never own: clicking one should recolour it or find the
    // area again from the real strokes, not from the old fill's ring. Nor does
    // anything that paints nothing, or a click on empty-looking board could
    // produce a fill out of nowhere.
    if (!rendersAnyMark(shape) || isFillPaint(shape)) continue;
    if (!BOUNDARY_KINDS.has(shape.kind)) continue;
    const ring = closedRing(shape);
    if (ring && containsEvenOdd(ring, point)) return { shape, ring };
  }
  return null;
}

/** A solid fill above some outlines, ready to clip them against. */
interface Coverer {
  readonly shape: Shape;
  readonly ring: readonly Vec2[];
  readonly box: Box;
  readonly layer: number;
}

/**
 * The parts of a–b that show: whatever lies inside a solid fill above it, by
 * more than `margin`, is hidden and taken out. A stroke whose centre runs
 * along a fill's edge — which is where a fill bounded by that stroke ends —
 * still shows its outer half, so it keeps bounding.
 */
function clipSegmentToVisible(
  a: Vec2,
  b: Vec2,
  coverers: readonly Coverer[],
  eps: number,
  margin: number,
): Segment[] {
  let intervals: Array<[number, number]> = [[0, 1]];
  const segmentBox: Box = [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
  ];
  for (const coverer of coverers) {
    if (intervals.length === 0) break;
    if (!boxesIntersect(segmentBox, coverer.box)) continue;
    const breaks = [0];
    for (const edge of ringSegments(coverer.ring)) {
      const hit = segmentIntersection([a, b], edge, eps);
      if (!hit) continue;
      const t = projectParam(a, b, hit);
      if (t > 0 && t < 1) breaks.push(t);
    }
    breaks.push(1);
    breaks.sort((x, y) => x - y);
    const covered: Array<[number, number]> = [];
    for (let k = 0; k < breaks.length - 1; k++) {
      const t0 = breaks[k]!;
      const t1 = breaks[k + 1]!;
      if (t1 - t0 < 1e-9) continue;
      const mid = pointAtParam(a, b, (t0 + t1) / 2);
      if (containsEvenOdd(coverer.ring, mid) && distanceToRing(coverer.ring, mid) > margin) {
        covered.push([t0, t1]);
      }
    }
    if (covered.length) intervals = subtractIntervals(intervals, covered);
  }
  return intervals
    .filter(([t0, t1]) => distance(pointAtParam(a, b, t0), pointAtParam(a, b, t1)) >= eps)
    .map(([t0, t1]) => [pointAtParam(a, b, t0), pointAtParam(a, b, t1)] as Segment);
}

// ---------------------------------------------------------------------------
// The arrangement: segments split where they meet, walked into closed areas
// ---------------------------------------------------------------------------

/**
 * Points merged when they fall within `eps` of each other, through a spatial
 * hash, so the graph has no near-duplicate vertices.
 */
class NodeStore {
  readonly nodes: Vec2[] = [];
  private readonly cells = new Map<string, number[]>();
  private readonly cellSize: number;

  constructor(private readonly eps: number) {
    this.cellSize = Math.max(eps, 1);
  }

  getOrCreate(p: Vec2): number {
    const cx = Math.floor(p[0] / this.cellSize);
    const cy = Math.floor(p[1] / this.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(`${cx + dx}:${cy + dy}`);
        if (!bucket) continue;
        for (const index of bucket) {
          if (distance(this.nodes[index]!, p) <= this.eps) return index;
        }
      }
    }
    const index = this.nodes.length;
    this.nodes.push(p);
    const key = `${cx}:${cy}`;
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index);
    else this.cells.set(key, [index]);
    return index;
  }

  /**
   * Every node within `radius` of `p` — and possibly a few a little beyond,
   * by cell granularity, so callers check the distance themselves.
   */
  forEachInRadius(p: Vec2, radius: number, visit: (index: number) => void): void {
    const fromCx = Math.floor((p[0] - radius) / this.cellSize);
    const toCx = Math.floor((p[0] + radius) / this.cellSize);
    const fromCy = Math.floor((p[1] - radius) / this.cellSize);
    const toCy = Math.floor((p[1] + radius) / this.cellSize);
    for (let cx = fromCx; cx <= toCx; cx++) {
      for (let cy = fromCy; cy <= toCy; cy++) {
        const bucket = this.cells.get(`${cx}:${cy}`);
        if (bucket) for (const index of bucket) visit(index);
      }
    }
  }
}

interface WorkingSegment {
  readonly a: number;
  readonly b: number;
  readonly pa: Vec2;
  readonly pb: Vec2;
  readonly box: Box;
  readonly shapeId: string;
  readonly splits: Array<{ node: number; t: number }>;
}

/** A segment and the shape it came from. */
interface SourceSegment {
  readonly segment: Segment;
  readonly shapeId: string;
}

/** A closed ring from the walk, and the shapes whose outlines bound it. */
interface Face {
  readonly ring: Vec2[];
  readonly contributors: Set<string>;
  /**
   * Which connected piece of the graph the ring belongs to. Rings of another
   * piece lying inside the chosen area are islands — holes — while rings of
   * the same piece are just parts of it.
   */
  readonly componentId: number;
}

/**
 * Build the graph from the segments — split where they cross and where one
 * ends on another — and walk it into rings, each recording which shapes
 * bound it.
 *
 * Returns `[]` when there is nothing to walk and `null` when the graph is too
 * big to process.
 *
 * Overlapping collinear segments need no pass of their own: an overlap always
 * puts an end of one on the other, so the T-junction pass splits them and the
 * edge dedupe collapses the shared pieces into one edge.
 */
function buildFaces(
  rawSegments: readonly SourceSegment[],
  options: FillRegionOptions,
): Face[] | null {
  // Two radii, deliberately separate. `eps` merges points and splits strokes
  // at T-junctions; both move the fill's outline, so it stays small. The gap
  // tolerance closes gaps by adding edges, which moves nothing, so it can be
  // generous.
  const eps = options.snapEpsilon;
  const store = new NodeStore(eps);
  const segments: WorkingSegment[] = [];
  // The first shape to produce each node, for attributing bridge edges.
  const nodeShape = new Map<number, string>();

  for (const { segment, shapeId } of rawSegments) {
    // Segments shorter than eps are not dropped: their ends merge into one
    // node, which collapses them while keeping the outline connected.
    // Dropping them would break finely sampled curves apart.
    const a = store.getOrCreate(segment[0]);
    const b = store.getOrCreate(segment[1]);
    if (!nodeShape.has(a)) nodeShape.set(a, shapeId);
    if (!nodeShape.has(b)) nodeShape.set(b, shapeId);
    if (a === b) continue;
    const pa = store.nodes[a]!;
    const pb = store.nodes[b]!;
    segments.push({
      a,
      b,
      pa,
      pb,
      shapeId,
      box: [
        Math.min(pa[0], pb[0]),
        Math.min(pa[1], pb[1]),
        Math.max(pa[0], pb[0]),
        Math.max(pa[1], pb[1]),
      ],
      splits: [
        { node: a, t: 0 },
        { node: b, t: 1 },
      ],
    });
  }

  // Crossings. Sorted by left edge and swept, so each candidate pair is
  // tested once — a grid would test dense overlapping segments again in every
  // cell they share.
  const byMinX = segments
    .map((_, index) => index)
    .sort((p, q) => segments[p]!.box[0] - segments[q]!.box[0]);
  for (let oi = 0; oi < byMinX.length; oi++) {
    const si = segments[byMinX[oi]!]!;
    const sweepMaxX = si.box[2] + eps;
    const grown = expandBox(si.box, eps);
    for (let oj = oi + 1; oj < byMinX.length; oj++) {
      const sj = segments[byMinX[oj]!]!;
      if (sj.box[0] > sweepMaxX) break;
      if (!boxesIntersect(grown, sj.box)) continue;
      const hit = segmentIntersection([si.pa, si.pb], [sj.pa, sj.pb], eps);
      if (!hit) continue;
      const node = store.getOrCreate(hit);
      // A crossing can become a loose end once hidden parts are clipped away,
      // and a bridge from it needs a shape to belong to.
      if (!nodeShape.has(node)) nodeShape.set(node, si.shapeId);
      si.splits.push({ node, t: projectParam(si.pa, si.pb, store.nodes[node]!) });
      sj.splits.push({ node, t: projectParam(sj.pa, sj.pb, store.nodes[node]!) });
    }
  }

  // Splitting at crossings can grow the node count quadratically in a
  // pathological board; stop before the passes below turn a click into a
  // freeze.
  if (store.nodes.length > options.maxBoundarySegments * 4) return null;

  // T-junctions: a segment passing within `eps` of a node is split there.
  // Kept tight on purpose — routing an edge through a node further off the
  // stroke would visibly bend the fill; wider gaps are the bridging pass's.
  // Each segment goes into the grid cells along it grown by eps, so a node
  // only has to test the segments in its own cell.
  let sceneMinX = Infinity;
  let sceneMinY = Infinity;
  let sceneMaxX = -Infinity;
  let sceneMaxY = -Infinity;
  for (const s of segments) {
    sceneMinX = Math.min(sceneMinX, s.box[0]);
    sceneMinY = Math.min(sceneMinY, s.box[1]);
    sceneMaxX = Math.max(sceneMaxX, s.box[2]);
    sceneMaxY = Math.max(sceneMaxY, s.box[3]);
  }
  const sceneSpan = Math.max(sceneMaxX - sceneMinX, sceneMaxY - sceneMinY, 0);
  const segCellSize = Math.max(eps * 2, sceneSpan / 128);
  const segGrid = new Map<string, number[]>();
  segments.forEach((s, index) => {
    forEachCellAlongSegment(s.pa, s.pb, eps, segCellSize, (cx, cy) => {
      const key = `${cx}:${cy}`;
      const bucket = segGrid.get(key);
      if (bucket) bucket.push(index);
      else segGrid.set(key, [index]);
    });
  });
  for (let n = 0; n < store.nodes.length; n++) {
    const q = store.nodes[n]!;
    const bucket = segGrid.get(
      `${Math.floor(q[0] / segCellSize)}:${Math.floor(q[1] / segCellSize)}`,
    );
    if (!bucket) continue;
    for (const index of bucket) {
      const segment = segments[index]!;
      if (n === segment.a || n === segment.b) continue;
      const t = projectParam(segment.pa, segment.pb, q);
      if (t <= 0 || t >= 1) continue;
      if (pointSegmentDistance(q, segment.pa, segment.pb) <= eps)
        segment.splits.push({ node: n, t });
    }
  }

  // The graph's edges, each between neighbouring nodes along a segment.
  const edgeSet = new Set<string>();
  const adjacency = new Map<number, number[]>();
  const edgeShapes = new Map<string, Set<string>>();
  const edgeKey = (u: number, v: number): string => (u < v ? `${u}-${v}` : `${v}-${u}`);
  const link = (u: number, v: number): void => {
    const list = adjacency.get(u);
    if (list) list.push(v);
    else adjacency.set(u, [v]);
  };
  const addEdge = (u: number, v: number, shapeId: string): void => {
    if (u === v) return;
    if (distance(store.nodes[u]!, store.nodes[v]!) < eps) return;
    const key = edgeKey(u, v);
    const owners = edgeShapes.get(key);
    if (owners) owners.add(shapeId);
    else edgeShapes.set(key, new Set([shapeId]));
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    link(u, v);
    link(v, u);
  };

  for (const segment of segments) {
    const byNode = new Map<number, number>();
    for (const split of segment.splits) {
      if (!byNode.has(split.node)) byNode.set(split.node, split.t);
    }
    const ordered = [...byNode.entries()]
      .map(([node, t]) => ({ node, t }))
      .sort((p, q) => p.t - q.t);
    for (let k = 0; k < ordered.length - 1; k++) {
      addEdge(ordered[k]!.node, ordered[k + 1]!.node, segment.shapeId);
    }
  }

  // Nothing usable. Not an error — just nothing enclosed.
  if (edgeSet.size === 0) return [];

  // Bridging: close gaps up to the gap tolerance, so a stroke stopping a few
  // units short of another still encloses an area. Each loose end — a node
  // with one neighbour — gets a short edge to the nearest thing it nearly
  // meets: another node, or a point on a nearby edge (the edge is split there,
  // on the stroke). Nothing is moved, so a generous radius cannot bend the
  // fill; the worst it leaves is a short edge across the gap, hidden under
  // the stroke. This relies on every outline being a single clean pass —
  // rough's doubled strokes would have ends with two neighbours.
  const bridgeRadius = Math.max(eps, options.gapTolerance);
  const isLooseEnd = (node: number): boolean => new Set(adjacency.get(node) ?? []).size === 1;
  const looseEnds: number[] = [];
  for (const node of adjacency.keys()) {
    if (isLooseEnd(node)) looseEnds.push(node);
  }
  if (looseEnds.length > 0) {
    // A spatial hash of the live edges, updated as bridging splits and adds
    // them. Cells are at least the bridge radius wide, so any edge within it
    // is in the 3×3 cells around the query; the longest axis stays near 128
    // cells. Entries are never removed — dead edges are skipped on lookup.
    const edgeCellSize = Math.max(bridgeRadius, sceneSpan / 128, 1);
    const edgeGrid = new Map<string, Array<{ u: number; v: number }>>();
    const insertLiveEdge = (u: number, v: number): void => {
      const edge = { u, v };
      forEachCellAlongSegment(store.nodes[u]!, store.nodes[v]!, 0, edgeCellSize, (cx, cy) => {
        const key = `${cx}:${cy}`;
        const bucket = edgeGrid.get(key);
        if (bucket) bucket.push(edge);
        else edgeGrid.set(key, [edge]);
      });
    };
    for (const key of edgeSet) {
      const [u, v] = key.split('-').map(Number) as [number, number];
      insertLiveEdge(u, v);
    }
    const unlink = (u: number, v: number): Set<string> | undefined => {
      const key = edgeKey(u, v);
      edgeSet.delete(key);
      const owners = edgeShapes.get(key);
      edgeShapes.delete(key);
      const listU = adjacency.get(u);
      const listV = adjacency.get(v);
      listU?.splice(listU.indexOf(v), 1);
      listV?.splice(listV.indexOf(u), 1);
      return owners;
    };

    for (const loose of looseEnds) {
      // Already closed by an earlier bridge.
      if (!isLooseEnd(loose)) continue;
      const p = store.nodes[loose]!;
      const neighbours = adjacency.get(loose) ?? [];

      // The nearest node within reach that isn't already a neighbour. Nodes
      // closer than eps are the same point, and an edge to one is refused.
      let bestNode = -1;
      let bestNodeDistance = Infinity;
      store.forEachInRadius(p, bridgeRadius, (n) => {
        if (n === loose || neighbours.includes(n)) return;
        const d = distance(p, store.nodes[n]!);
        if (d >= eps && d <= bridgeRadius && d < bestNodeDistance) {
          bestNodeDistance = d;
          bestNode = n;
        }
      });

      // The nearest edge, not touching the loose end, that it projects onto.
      let bestEdge: { u: number; v: number } | null = null;
      let bestEdgeDistance = Infinity;
      let bestEdgeT = 0;
      const looseCx = Math.floor(p[0] / edgeCellSize);
      const looseCy = Math.floor(p[1] / edgeCellSize);
      // An edge spans cells, so it can turn up in several of the nine.
      const seen = new Set<string>();
      for (let dcx = -1; dcx <= 1; dcx++) {
        for (let dcy = -1; dcy <= 1; dcy++) {
          const bucket = edgeGrid.get(`${looseCx + dcx}:${looseCy + dcy}`);
          if (!bucket) continue;
          for (const edge of bucket) {
            const key = edgeKey(edge.u, edge.v);
            if (seen.has(key)) continue;
            seen.add(key);
            if (!edgeSet.has(key) || edge.u === loose || edge.v === loose) continue;
            const eu = store.nodes[edge.u]!;
            const ev = store.nodes[edge.v]!;
            const t = projectParam(eu, ev, p);
            if (t <= 0 || t >= 1) continue;
            const d = pointSegmentDistance(p, eu, ev);
            if (d <= bridgeRadius && d < bestEdgeDistance) {
              bestEdgeDistance = d;
              bestEdge = edge;
              bestEdgeT = t;
            }
          }
        }
      }

      const bridgeShape = nodeShape.get(loose) ?? segments[0]!.shapeId;
      if (bestEdge && bestEdgeDistance < bestNodeDistance) {
        const eu = store.nodes[bestEdge.u]!;
        const ev = store.nodes[bestEdge.v]!;
        const projection = store.getOrCreate(pointAtParam(eu, ev, bestEdgeT));
        if (projection === bestEdge.u || projection === bestEdge.v) {
          // The projection merged into an end of the edge: a plain node bridge.
          addEdge(loose, projection, bridgeShape);
          insertLiveEdge(loose, projection);
        } else {
          if (!nodeShape.has(projection)) {
            const edgeOwner = edgeShapes
              .get(edgeKey(bestEdge.u, bestEdge.v))
              ?.values()
              .next().value;
            nodeShape.set(projection, edgeOwner ?? bridgeShape);
          }
          const owners = unlink(bestEdge.u, bestEdge.v) ?? new Set([bridgeShape]);
          for (const owner of owners) {
            addEdge(bestEdge.u, projection, owner);
            addEdge(projection, bestEdge.v, owner);
          }
          insertLiveEdge(bestEdge.u, projection);
          insertLiveEdge(projection, bestEdge.v);
          addEdge(loose, projection, bridgeShape);
          insertLiveEdge(loose, projection);
        }
      } else if (bestNode >= 0) {
        addEdge(loose, bestNode, bridgeShape);
        insertLiveEdge(loose, bestNode);
      }
    }
  }

  // Connected pieces of the final graph, bridges included — an island bridged
  // to its surroundings is part of them and can't become a hole.
  const componentOf = new Map<number, number>();
  let componentCount = 0;
  for (const start of adjacency.keys()) {
    if (componentOf.has(start)) continue;
    const stack = [start];
    componentOf.set(start, componentCount);
    while (stack.length) {
      const node = stack.pop()!;
      for (const neighbour of adjacency.get(node) ?? []) {
        if (!componentOf.has(neighbour)) {
          componentOf.set(neighbour, componentCount);
          stack.push(neighbour);
        }
      }
    }
    componentCount++;
  }

  // Each node's neighbours in order of direction.
  const angleOf = (from: number, to: number): number =>
    Math.atan2(
      store.nodes[to]![1] - store.nodes[from]![1],
      store.nodes[to]![0] - store.nodes[from]![0],
    );
  const sortedOut = new Map<number, number[]>();
  const positionOf = new Map<number, Map<number, number>>();
  for (const [node, neighbours] of adjacency) {
    const unique = [...new Set(neighbours)];
    unique.sort((p, q) => angleOf(node, p) - angleOf(node, q));
    sortedOut.set(node, unique);
    positionOf.set(node, new Map(unique.map((neighbour, index) => [neighbour, index])));
  }

  // Walk every directed edge into the ring it borders.
  const visited = new Set<string>();
  const faces: Face[] = [];
  const maxSteps = edgeSet.size * 2 + 4;
  for (const [node, neighbours] of adjacency) {
    for (const first of neighbours) {
      if (visited.has(`${node}->${first}`)) continue;
      const ring: number[] = [];
      let from = node;
      let to = first;
      let steps = 0;
      while (steps++ <= maxSteps) {
        visited.add(`${from}->${to}`);
        ring.push(from);
        const outs = sortedOut.get(to)!;
        const twinPosition = positionOf.get(to)!.get(from)!;
        // The next edge round the ring is the one just before the way back.
        const next = outs[(twinPosition - 1 + outs.length) % outs.length]!;
        from = to;
        to = next;
        if (from === node && to === first) break;
      }
      if (ring.length >= 3) {
        const contributors = new Set<string>();
        for (let k = 0; k < ring.length; k++) {
          const owners = edgeShapes.get(edgeKey(ring[k]!, ring[(k + 1) % ring.length]!));
          if (owners) for (const id of owners) contributors.add(id);
        }
        faces.push({
          ring: ring.map((index) => store.nodes[index]!),
          contributors,
          componentId: componentOf.get(node) ?? -1,
        });
      }
    }
  }

  return faces;
}

interface FaceSelection {
  readonly face: Face;
  /** Islands to cut out of the face — see `selectFace`. */
  readonly holes: Face[];
}

/**
 * The smallest closed area containing the click, and its holes.
 *
 * The walk traces every closed area with a positive area and every piece's
 * outside contour with a negative one, and that sign alone decides which is
 * which. Comparing sizes would not: the outermost outline's inside and
 * outside trace the same polygon with the same size.
 *
 * Each piece of the graph has exactly one outside contour; a piece whose
 * contour lies inside the chosen area is an island the fill flows around.
 * Only the outermost islands count — one inside another already sits in a
 * hole.
 */
function selectFace(
  faces: readonly Face[],
  point: Vec2,
  options: FillRegionOptions,
): FaceSelection | null {
  if (faces.length === 0) return null;
  const areaOf = new Map<Face, number>();
  for (const face of faces) areaOf.set(face, signedArea(face.ring));

  let best: Face | null = null;
  let bestArea = Infinity;
  for (const face of faces) {
    const area = areaOf.get(face)!;
    if (area <= 0) continue;
    if (area < options.minArea) continue;
    if (!containsNonZero(face.ring, point)) continue;
    if (area < bestArea) {
      bestArea = area;
      best = face;
    }
  }
  if (!best) return null;
  const selected = best;

  const islandCandidates = faces.filter(
    (face) =>
      face.componentId !== selected.componentId &&
      areaOf.get(face)! < 0 &&
      -areaOf.get(face)! >= options.minArea &&
      // Never a hole the click is in — the smallest-area choice already
      // rules it out, this only guards it.
      !containsNonZero(face.ring, point) &&
      // Pieces never cross (a crossing would have joined them), so one point
      // decides containment.
      containsNonZero(selected.ring, face.ring[0]!),
  );
  const holes = islandCandidates.filter(
    (hole) =>
      !islandCandidates.some(
        (other) => other !== hole && containsNonZero(other.ring, hole.ring[0]!),
      ),
  );
  return { face: selected, holes };
}

// ---------------------------------------------------------------------------
// Simplification
// ---------------------------------------------------------------------------

function dedupeConsecutive(points: readonly Vec2[], eps: number): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    if (out.length === 0 || distance(out[out.length - 1]!, p) >= eps) out.push(p);
  }
  while (out.length > 1 && distance(out[0]!, out[out.length - 1]!) < eps) out.pop();
  return out;
}

function removeCollinear(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 3) return [...points];
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = out[out.length - 1] ?? points[points.length - 1]!;
    const next = points[(i + 1) % points.length]!;
    if (perpendicularDistance(points[i]!, prev, next) >= tolerance) out.push(points[i]!);
  }
  return out.length >= 3 ? out : [...points];
}

/** An open ring thinned to fit `budget` points, or null if it can't be or collapses. */
function simplifyRing(
  ring: readonly Vec2[],
  options: FillRegionOptions,
  budget: number,
): Vec2[] | null {
  const points = dedupeConsecutive(ring, options.snapEpsilon);
  if (points.length < 3) return null;
  // The tolerance the freehand renderer uses, doubled until the ring fits.
  let tolerance = 0.75;
  let simplified = simplifyPoints(points, tolerance) as Vec2[];
  while (simplified.length > budget && tolerance < 1e6) {
    tolerance *= 2;
    simplified = simplifyPoints(points, tolerance) as Vec2[];
  }
  if (simplified.length > budget) return null;
  simplified = removeCollinear(simplified, 0.05);
  return simplified.length >= 3 ? simplified : null;
}

/**
 * A hole spliced into the ring as a zero-width keyhole: along the ring to
 * the nearest point, across to the hole, round it, and back the same way.
 * The doubled bridge cancels under the even-odd rule, so the hole stays
 * unpainted while the result is still one closed polygon.
 */
function spliceHole(ring: readonly Vec2[], hole: readonly Vec2[]): Vec2[] {
  // The opposite winding: even-odd doesn't mind, but nonzero would.
  const oriented =
    Math.sign(signedArea(hole)) === Math.sign(signedArea(ring)) ? [...hole].reverse() : hole;

  // The shortest bridge, so the invisible channel never crosses the area.
  let bestRing = 0;
  let bestHole = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < ring.length; i++) {
    for (let j = 0; j < oriented.length; j++) {
      const d = distance(ring[i]!, oriented[j]!);
      if (d < bestDistance) {
        bestDistance = d;
        bestRing = i;
        bestHole = j;
      }
    }
  }

  const out: Vec2[] = ring.slice(0, bestRing + 1);
  // The whole hole, ending back on the point it started from.
  for (let k = 0; k <= oriented.length; k++) out.push(oriented[(bestHole + k) % oriented.length]!);
  out.push(ring[bestRing]!);
  out.push(...ring.slice(bestRing + 1));
  return out;
}

/**
 * The area's ring and its holes, each thinned on its own so the keyhole
 * bridges stay exactly zero-width, spliced together and closed — first point
 * repeated last — with which holes made it in. Null when the outer ring
 * cannot make a polygon. A hole that does not fit what is left of the point
 * budget is dropped, and the island is painted over.
 */
function finalizePolygon(
  outerRing: readonly Vec2[],
  holeRings: readonly Vec2[][],
  options: FillRegionOptions,
): { points: Vec2[]; splicedHoles: number[] } | null {
  let ring = simplifyRing(outerRing, options, options.maxGeneratedPoints);
  if (!ring) return null;

  // Largest first, so a tight budget drops the least visible islands.
  const byAreaDesc = holeRings
    .map((holeRing, index) => ({ holeRing, index }))
    .sort((p, q) => Math.abs(signedArea(q.holeRing)) - Math.abs(signedArea(p.holeRing)));
  const splicedHoles: number[] = [];
  for (const { holeRing, index } of byAreaDesc) {
    // A hole costs its own points and the two bridge ends.
    const budget = options.maxGeneratedPoints - ring.length - 2;
    if (budget < 3) break;
    const hole = simplifyRing(holeRing, options, budget);
    if (!hole) continue;
    ring = spliceHole(ring, hole);
    splicedHoles.push(index);
  }

  return { points: [...ring, ring[0]!], splicedHoles };
}

// ---------------------------------------------------------------------------
// The fill
// ---------------------------------------------------------------------------

/**
 * The closed area under `point`, as the polygon to fill it with.
 *
 * `shapes` is the board in layer order, bottom first. Hidden shapes are left
 * out here, so the caller can pass the board as it stands.
 */
export function computeFillRegion(args: {
  readonly point: Vec2;
  readonly shapes: readonly Shape[];
  readonly options?: Partial<FillRegionOptions>;
}): FillRegionResult {
  const options: FillRegionOptions = { ...DEFAULT_FILL_REGION_OPTIONS, ...args.options };
  const { point } = args;
  const shapes = visibleShapes(args.shapes);

  const boxes = new Map<string, Box>();
  const boxOf = (shape: Shape): Box => {
    let box = boxes.get(shape.id);
    if (!box) {
      box = boxOfRect(shapeBounds(shape));
      boxes.set(shape.id, box);
    }
    return box;
  };
  const layerOf = new Map<string, number>();
  shapes.forEach((shape, i) => layerOf.set(shape.id, i));

  // 1. The shape the click is inside — the common case. With none (an area
  // formed by open lines) everything near the click is used instead, below.
  const owner = findOwner(point, shapes);

  // 2. The outline segments within `bounds`, each tagged with its shape and
  // cut to what shows: a stretch of outline under a solid fill above it is
  // invisible, and only what the user can see stops a fill. Null once over
  // the segment budget.
  const collectSegments = (bounds: Box, primary: Shape | null): SourceSegment[] | null => {
    const inRange = (shape: Shape): boolean => boxesIntersect(bounds, boxOf(shape));
    const boundaries = shapes.filter(
      (shape) => shape.id !== primary?.id && isEligibleBoundary(shape) && inRange(shape),
    );
    // Earlier fills count: an outline buried under an opaque fill is hidden,
    // so it must not stop a new fill either.
    const coverers: Coverer[] = [];
    for (const shape of shapes) {
      if (!rendersOpaqueFill(shape) || !inRange(shape)) continue;
      const ring = paintedArea(shape);
      if (ring) {
        coverers.push({ shape, ring, box: boxOfPoints(ring), layer: layerOf.get(shape.id) ?? 0 });
      }
    }

    const rawSegments: SourceSegment[] = [];
    const collect = (shape: Shape): void => {
      const layer = layerOf.get(shape.id) ?? 0;
      const coverersAbove = coverers.filter((c) => c.shape.id !== shape.id && c.layer > layer);
      // Half the stroke still shows where its centre runs along a fill's edge.
      const clipMargin = Math.max(options.snapEpsilon, strokeWidthOf(shape) / 2, COVER_MARGIN);
      for (const segment of boundarySegments(shape, options.snapEpsilon)) {
        // Checked while collecting: a huge board would otherwise do all the
        // clipping before the budget is ever looked at.
        if (rawSegments.length > options.maxBoundarySegments) return;
        // Keep the very short ones (see buildFaces); only zero-length ones are noise.
        if (distance(segment[0], segment[1]) === 0) continue;
        if (coverersAbove.length === 0) {
          rawSegments.push({ segment, shapeId: shape.id });
          continue;
        }
        for (const visible of clipSegmentToVisible(
          segment[0],
          segment[1],
          coverersAbove,
          options.snapEpsilon,
          clipMargin,
        )) {
          rawSegments.push({ segment: visible, shapeId: shape.id });
        }
      }
    };
    for (const shape of primary ? [primary, ...boundaries] : boundaries) {
      if (rawSegments.length > options.maxBoundarySegments) break;
      collect(shape);
    }
    return rawSegments.length > options.maxBoundarySegments ? null : rawSegments;
  };

  const buildAndSelect = (
    rawSegments: readonly SourceSegment[],
  ): FaceSelection | null | 'too_complex' => {
    const faces = buildFaces(rawSegments, options);
    if (!faces) return 'too_complex';
    return selectFace(faces, point, options);
  };

  // 3. The area under the click.
  let selection: FaceSelection | null = null;
  if (owner) {
    const pad = options.gapTolerance + 2 + Math.max(strokeWidthOf(owner.shape), 1);
    const rawSegments = collectSegments(expandBox(boxOf(owner.shape), pad), owner.shape);
    if (!rawSegments) return { ok: false, reason: 'too_complex' };
    const selected = buildAndSelect(rawSegments);
    if (selected === 'too_complex') return { ok: false, reason: 'too_complex' };
    if (!selected) return { ok: false, reason: 'open_region' };
    selection = selected;
  } else {
    // A growing box around the click. An area is final once its ring stays
    // clear of the box's edge — anything that could still divide it would
    // cross the box and already be included. One touching the edge may be
    // missing outlines further out, so grow and try again.
    const totalEligible = shapes.reduce(
      (count, shape) => count + (isEligibleBoundary(shape) ? 1 : 0),
      0,
    );
    if (totalEligible === 0) return { ok: false, reason: 'no_owner' };
    let radius = options.fallbackSearchRadius;
    for (let attempt = 0; attempt < 4 && !selection; attempt++, radius *= 2) {
      const box: Box = [point[0] - radius, point[1] - radius, point[0] + radius, point[1] + radius];
      const inRange = shapes.reduce(
        (count, shape) =>
          count + (isEligibleBoundary(shape) && boxesIntersect(box, boxOf(shape)) ? 1 : 0),
        0,
      );
      // With every outline in range, a bigger box would build the same graph,
      // so whatever this one finds is final.
      const isFinalAttempt = attempt === 3 || inRange === totalEligible;
      // Nothing here yet — the area may lie further out.
      if (inRange === 0) continue;
      const rawSegments = collectSegments(box, null);
      // This search is speculative, so its failures stay quiet — over budget
      // included.
      if (!rawSegments) return { ok: false, reason: 'no_owner' };
      const selected = buildAndSelect(rawSegments);
      if (selected === 'too_complex') return { ok: false, reason: 'no_owner' };
      if (
        selected &&
        (isFinalAttempt ||
          selected.face.ring.every(
            ([x, y]) =>
              x > box[0] + options.gapTolerance &&
              y > box[1] + options.gapTolerance &&
              x < box[2] - options.gapTolerance &&
              y < box[3] - options.gapTolerance,
          ))
      ) {
        selection = selected;
      }
      if (!selection && isFinalAttempt) break;
    }
    // Nothing enclosed under the click. Quiet, like clicking open board.
    if (!selection) return { ok: false, reason: 'no_owner' };
  }
  const { face, holes } = selection;

  // 4. Thin and check. With holes spliced in, the ring's area is the net area
  // filled, which is what the size check should measure.
  const finalized = finalizePolygon(
    face.ring,
    holes.map((hole) => hole.ring),
    options,
  );
  if (!finalized) return { ok: false, reason: 'invalid_polygon' };
  const { points, splicedHoles } = finalized;
  if (Math.abs(signedArea(points)) < options.minArea) return { ok: false, reason: 'too_small' };

  // Spliced islands bound the fill as much as the outside does.
  const contributors = new Set(face.contributors);
  for (const index of splicedHoles) {
    for (const id of holes[index]!.contributors) contributors.add(id);
  }

  // 5. Where it goes in the layer order. Two rules, over every shape on the
  // board rather than only the ones bounding the fill:
  //
  // - above the topmost solid fill that overlaps the area anywhere. A filled
  //   area should read as evenly filled, so older solid paint must not show
  //   through it;
  // - otherwise below the lowest shape that has to stay visible: every shape
  //   bounding the fill (islands whose hole was dropped included — the fill
  //   paints straight over those, and staying below them is what keeps them
  //   visible), and anything that shows wholly inside the area, like a
  //   floating line or a label, which a solid fill would bury. A stroke merely
  //   crossing the area would have divided it and be bounding it already, so
  //   sampling a shape's centre and its points is enough. Containment is
  //   even-odd, matching how the fill paints, so what sits in a hole is not
  //   held below.
  //
  // When the two disagree, above the solid fill wins: a mark under solid
  // paint was mostly hidden already, while paint showing through a new fill
  // looks like the fill failed.
  const participants = new Set(owner ? [owner.shape.id, ...contributors] : contributors);
  for (const hole of holes) for (const id of hole.contributors) participants.add(id);

  const regionBox = boxOfPoints(points);
  const markInsideRegion = (shape: Shape): boolean => {
    const box = boxOf(shape);
    if (!boxesIntersect(box, regionBox)) return false;
    const samples: Vec2[] = [[(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]];
    if (shape.kind === 'line' || shape.kind === 'arrow' || shape.kind === 'freehand') {
      const step = Math.max(1, Math.floor(shape.points.length / 8));
      for (let i = 0; i < shape.points.length; i += step) {
        const [px, py] = shape.points[i]!;
        samples.push([shape.x + px, shape.y + py]);
      }
    }
    return samples.some((sample) => containsEvenOdd(points, sample));
  };

  // Whether a solid fill overlaps the area at all — its outline inside the
  // area, the area's ring inside it, or the click itself. Sampled: this only
  // decides a layer.
  const paintOverlapsRegion = (shape: Shape): boolean => {
    if (!boxesIntersect(boxOf(shape), regionBox)) return false;
    const ring = paintedArea(shape);
    if (!ring) return false;
    if (containsEvenOdd(ring, point)) return true;
    const ringStep = Math.max(1, Math.floor(ring.length / 16));
    for (let i = 0; i < ring.length; i += ringStep) {
      if (containsEvenOdd(points, ring[i]!)) return true;
    }
    const regionStep = Math.max(1, Math.floor(points.length / 16));
    for (let i = 0; i < points.length; i += regionStep) {
      if (containsEvenOdd(ring, points[i]!)) return true;
    }
    return false;
  };

  let lowestAbove: Shape | null = null;
  let covering: Shape | null = null;
  for (const shape of shapes) {
    // Checked for every shape, not only those held above: a solid fill
    // overlapping the area away from the click, or straddling its edge,
    // neither bounds it nor sits inside it, and missing it would put the fill
    // beneath it with its paint showing through.
    if (rendersOpaqueFill(shape) && paintOverlapsRegion(shape)) covering = shape;
    const mustStayAbove =
      participants.has(shape.id) || (rendersAnyMark(shape) && markInsideRegion(shape));
    if (mustStayAbove) lowestAbove = lowestAbove ?? shape;
  }
  // An area always has a shape bounding it; the last-shape fallback only guards.
  const placement: FillPlacement = covering
    ? { placement: 'above', shapeId: covering.id }
    : { placement: 'below', shapeId: (lowestAbove ?? shapes[shapes.length - 1]!).id };

  return {
    ok: true,
    ownerId: owner?.shape.id ?? null,
    boundaryIds: [...contributors].filter((id) => id !== owner?.shape.id),
    points,
    placement,
  };
}

/**
 * Whether the fill the click landed on should be recoloured rather than
 * covered by a new one, given the area the click found.
 *
 * Only when it is fill paint (see `isFillPaint`) — a fill given a stroke has
 * become an outline — and covers the same area: the same net area and the
 * same bounds. Without that check a click inside a shape drawn on top of a
 * filled area would recolour the fill underneath instead of filling the
 * shape, and a click in part of an old fill since divided by a new stroke
 * would recolour all of it.
 */
export function isRestylableFill(hit: Shape, points: readonly Vec2[]): boolean {
  if (!isFillPaint(hit)) return false;
  const ring = absolutePath(hit);
  const fillArea = Math.abs(signedArea(ring));
  const regionArea = Math.abs(signedArea(points));
  const sameArea = Math.abs(fillArea - regionArea) <= 0.05 * Math.max(fillArea, regionArea);
  const a = boxOfPoints(ring);
  const b = boxOfPoints(points);
  const sameBounds = a.every((value, i) => Math.abs(value - b[i]!) <= REGION_MATCH_TOLERANCE);
  return sameArea && sameBounds;
}

/**
 * The fill as the shape's own fields: an origin at its first point and the
 * rest relative to it, the way a line stores its points.
 */
export function fillPolygonPoints(points: readonly Vec2[]): {
  readonly x: number;
  readonly y: number;
  readonly points: ReadonlyArray<readonly [number, number]>;
} {
  const [x, y] = points[0]!;
  return { x, y, points: points.map(([px, py]) => [px - x, py - y] as const) };
}
