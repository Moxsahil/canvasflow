import type { Segment, Vec2 } from '../geometry/segment.js';
import { diamondPoints } from './diamond.js';
import { shapeBounds } from './bounds.js';
import { isPathALoop } from '../utils/simplify.js';
import { polygonCornerCut, roundedRectRadius } from './corners.js';
import type { Shape } from './shape.js';

/** Segment count used to approximate an ellipse. Fine at practical zoom levels. */
const ELLIPSE_SEGMENTS = 24;

/** Consecutive points joined into segments; optionally closed back to the start. */
function polylineSegments(points: readonly Vec2[], close: boolean): Segment[] {
  const segments: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    segments.push([points[i - 1]!, points[i]!]);
  }
  if (close && points.length > 2) {
    segments.push([points[points.length - 1]!, points[0]!]);
  }
  return segments;
}

function rectCorners(x: number, y: number, width: number, height: number): Vec2[] {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}

/** Shape-relative points lifted into absolute canvas coordinates. */
function absolutePoints(shape: {
  x: number;
  y: number;
  points: ReadonlyArray<readonly [number, number]>;
}): Vec2[] {
  return shape.points.map(([px, py]) => [shape.x + px, shape.y + py] as Vec2);
}

/**
 * A shape's outline as straight segments, in absolute coordinates.
 *
 * Curves are approximated by polylines — the eraser only needs enough
 * precision to feel right under the pointer, and segments keep the
 * intersection maths to one cheap primitive.
 *
 * Rounded corners are ignored: the difference is at most a few pixels inside
 * the corner, and always in the direction of erasing slightly early.
 */
export function shapeOutlineSegments(shape: Shape): Segment[] {
  switch (shape.kind) {
    case 'rectangle':
    case 'text':
    case 'image':
    case 'frame': {
      const b = shapeBounds(shape);
      return polylineSegments(rectCorners(b.x, b.y, b.width, b.height), true);
    }
    case 'diamond':
      return polylineSegments(diamondPoints(shape) as Vec2[], true);
    case 'ellipse': {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const rx = shape.width / 2;
      const ry = shape.height / 2;
      const points: Vec2[] = [];
      for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
        const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
        points.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
      }
      return polylineSegments(points, true);
    }
    case 'line':
    case 'arrow':
    case 'freehand':
      return polylineSegments(absolutePoints(shape), false);
  }
}

/** Points along each rounded corner's curve, the corner's own ends included. */
const CORNER_SAMPLES = 8;

/** Points around an ellipse, for an outline something has to land on. */
const EXACT_ELLIPSE_SAMPLES = 96;

/**
 * A closed polygon with its corners rounded off as the renderer rounds them:
 * cut back along both edges and bridged by a quadratic through the corner.
 */
function roundedPolygon(
  points: readonly Vec2[],
  cutFor: (prevLength: number, nextLength: number) => number,
): Vec2[] {
  const n = points.length;
  const outline: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const corner = points[i]!;
    const next = points[(i + 1) % n]!;
    const prevLength = Math.hypot(prev[0] - corner[0], prev[1] - corner[1]) || 1;
    const nextLength = Math.hypot(next[0] - corner[0], next[1] - corner[1]) || 1;
    const cut = cutFor(prevLength, nextLength);
    const start: Vec2 = [
      corner[0] + ((prev[0] - corner[0]) / prevLength) * cut,
      corner[1] + ((prev[1] - corner[1]) / prevLength) * cut,
    ];
    const end: Vec2 = [
      corner[0] + ((next[0] - corner[0]) / nextLength) * cut,
      corner[1] + ((next[1] - corner[1]) / nextLength) * cut,
    ];
    for (let k = 0; k <= CORNER_SAMPLES; k++) {
      const t = k / CORNER_SAMPLES;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      outline.push([
        a * start[0] + b * corner[0] + c * end[0],
        a * start[1] + b * corner[1] + c * end[1],
      ]);
    }
  }
  return outline;
}

/**
 * A closed shape's outline exactly as it is drawn — rounded corners on their
 * curves, an ellipse finely sampled — as the points of a closed polygon. For
 * what has to land on the outline rather than near it: an arrow attached to
 * a shape. Null for the kinds that have no closed outline.
 */
export function shapeExactOutline(shape: Shape): Vec2[] | null {
  switch (shape.kind) {
    case 'rectangle': {
      const corners = rectCorners(shape.x, shape.y, shape.width, shape.height);
      if (shape.edges !== 'round') return corners;
      const radius = roundedRectRadius(shape.width, shape.height);
      return roundedPolygon(corners, () => radius);
    }
    case 'diamond': {
      const points = diamondPoints(shape) as Vec2[];
      return shape.edges === 'round' ? roundedPolygon(points, polygonCornerCut) : points;
    }
    case 'ellipse': {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const points: Vec2[] = [];
      for (let i = 0; i < EXACT_ELLIPSE_SAMPLES; i++) {
        const t = (i / EXACT_ELLIPSE_SAMPLES) * Math.PI * 2;
        points.push([cx + (Math.cos(t) * shape.width) / 2, cy + (Math.sin(t) * shape.height) / 2]);
      }
      return points;
    }
    case 'text':
    case 'image':
    case 'frame': {
      const b = shapeBounds(shape);
      return rectCorners(b.x, b.y, b.width, b.height);
    }
    case 'line':
    case 'arrow':
    case 'freehand':
      return null;
  }
}

/** Even-odd point-in-polygon. */
function polygonContains(points: readonly Vec2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function shapeHasSolidInterior(shape: Shape): boolean {
  switch (shape.kind) {
    case 'text':
      return true;
    // Transparent pixels are common enough in a PNG, but treating an image as
    // hollow would mean the eraser passed straight through the middle of a
    // photo. Its box is what the user sees, so its box is what they can hit.
    case 'image':
      return true;
    case 'arrow':
      return false;
    // Hollow however it is filled. Rubbing out the things inside a frame is
    // the common intent by a wide margin, and treating the interior as solid
    // would delete the container out from under them on the first stroke.
    // Crossing the border still erases the frame itself.
    case 'frame':
      return false;
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      return shape.fillColor !== null;
    case 'line':
    case 'freehand':
      return shape.fillColor !== null && isPathALoop(shape.points);
  }
}

/** Whether (x, y) falls inside the shape's outline. */
export function shapeContainsPoint(shape: Shape, x: number, y: number): boolean {
  if (
    shape.kind === 'rectangle' ||
    shape.kind === 'text' ||
    shape.kind === 'image' ||
    shape.kind === 'frame'
  ) {
    const b = shapeBounds(shape);
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  }

  if (shape.kind === 'ellipse') {
    const rx = shape.width / 2;
    const ry = shape.height / 2;
    if (rx === 0 || ry === 0) return false;
    const nx = (x - (shape.x + rx)) / rx;
    const ny = (y - (shape.y + ry)) / ry;
    return nx * nx + ny * ny <= 1;
  }

  if (shape.kind === 'diamond') {
    return polygonContains(diamondPoints(shape) as Vec2[], x, y);
  }

  return polygonContains(absolutePoints(shape), x, y);
}
