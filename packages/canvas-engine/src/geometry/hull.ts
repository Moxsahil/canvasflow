import type { Vec2 } from './segment.js';

/**
 * The convex hull of `points`, anticlockwise, by Andrew's monotone chain.
 *
 * Fewer than three points have no hull with area, and are returned as given.
 */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  if (points.length < 3) return [...points];

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Positive when c sits left of a→b, which is the turn direction a hull keeps.
  const turnsLeft = (a: Vec2, b: Vec2, c: Vec2) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;

  const build = (ordered: readonly Vec2[]): Vec2[] => {
    const chain: Vec2[] = [];
    for (const point of ordered) {
      while (
        chain.length >= 2 &&
        !turnsLeft(chain[chain.length - 2]!, chain[chain.length - 1]!, point)
      ) {
        chain.pop();
      }
      chain.push(point);
    }
    // The last point of each chain opens the other one.
    chain.pop();
    return chain;
  };

  return [...build(sorted), ...build([...sorted].reverse())];
}

/** The area enclosed by a polygon, by the shoelace formula. Always positive. */
export function polygonArea(polygon: readonly Vec2[]): number {
  if (polygon.length < 3) return 0;

  let doubled = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % polygon.length]!;
    doubled += x1 * y2 - x2 * y1;
  }
  return Math.abs(doubled) / 2;
}
