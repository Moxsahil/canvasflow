import type { Rect } from '../math.js';

/** A point as a tuple, matching how shapes store their points. */
export type Vec2 = readonly [number, number];

/** A straight span between two points. */
export type Segment = readonly [Vec2, Vec2];

/**
 * Squared distance from `p` to the segment `a`–`b`.
 *
 * Squared so callers can compare against a squared tolerance and skip the
 * square root — this runs per element per pointer move.
 */
export function pointSegmentDistanceSq(p: Vec2, a: Vec2, b: Vec2): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;

  if (dx !== 0 || dy !== 0) {
    // Project p onto the infinite line, then clamp to the segment.
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  return Math.sqrt(pointSegmentDistanceSq(p, a, b));
}

/** Cross product of (b−a) × (c−a); sign tells which side of a→b that c is on. */
function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Whether collinear point `p` lies within the extent of segment `a`–`b`. */
function withinExtent(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    Math.min(a[0], b[0]) <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] &&
    p[1] <= Math.max(a[1], b[1])
  );
}

/**
 * Whether two segments cross, touch, or overlap.
 *
 * The standard orientation test: the segments properly cross when each
 * straddles the other's line. The four zero cases below cover touching
 * endpoints and collinear overlap, which the strict straddle test misses.
 */
export function segmentsIntersect(s1: Segment, s2: Segment): boolean {
  const [a, b] = s1;
  const [c, d] = s2;

  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);

  if (d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0) return true;

  if (d1 === 0 && withinExtent(c, d, a)) return true;
  if (d2 === 0 && withinExtent(c, d, b)) return true;
  if (d3 === 0 && withinExtent(a, b, c)) return true;
  if (d4 === 0 && withinExtent(a, b, d)) return true;

  return false;
}

/**
 * Shortest distance between two segments — 0 when they cross.
 *
 * This is the eraser's core predicate: it catches both "the stroke passed
 * through the shape" and "the stroke passed close enough to count", which a
 * pure intersection test would miss for thin or fast strokes.
 */
export function segmentsDistance(s1: Segment, s2: Segment): number {
  if (segmentsIntersect(s1, s2)) return 0;
  return Math.sqrt(
    Math.min(
      pointSegmentDistanceSq(s1[0], s2[0], s2[1]),
      pointSegmentDistanceSq(s1[1], s2[0], s2[1]),
      pointSegmentDistanceSq(s2[0], s1[0], s1[1]),
      pointSegmentDistanceSq(s2[1], s1[0], s1[1]),
    ),
  );
}

/** Axis-aligned bounds of a segment, grown by `padding` on every side. */
export function segmentBounds(segment: Segment, padding = 0): Rect {
  const [a, b] = segment;
  const x = Math.min(a[0], b[0]) - padding;
  const y = Math.min(a[1], b[1]) - padding;
  return {
    x,
    y,
    width: Math.max(a[0], b[0]) + padding - x,
    height: Math.max(a[1], b[1]) + padding - y,
  };
}
