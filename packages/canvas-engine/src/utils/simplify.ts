import { pointSegmentDistanceSq } from '../geometry/segment.js';

type Point = readonly [number, number];

/** Ramer–Douglas–Peucker over the inclusive range [first, last]. */
function rdp(
  points: readonly Point[],
  first: number,
  last: number,
  epsilonSq: number,
  out: Point[],
) {
  let maxDistSq = epsilonSq;
  let index = -1;

  for (let i = first + 1; i < last; i++) {
    const distSq = pointSegmentDistanceSq(points[i]!, points[first]!, points[last]!);
    if (distSq > maxDistSq) {
      index = i;
      maxDistSq = distSq;
    }
  }

  if (index === -1) return;

  if (index - first > 1) rdp(points, first, index, epsilonSq, out);
  out.push(points[index]!);
  if (last - index > 1) rdp(points, index, last, epsilonSq, out);
}

export function simplifyPoints(points: readonly Point[], tolerance = 0.75): Point[] {
  if (points.length <= 2) return [...points];

  const epsilonSq = tolerance * tolerance;
  const out: Point[] = [points[0]!];
  rdp(points, 0, points.length - 1, epsilonSq, out);
  out.push(points[points.length - 1]!);
  return out;
}

export function isPathALoop(points: readonly Point[], threshold = 16): boolean {
  if (points.length < 3) return false;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return Math.hypot(first[0] - last[0], first[1] - last[1]) <= threshold;
}
