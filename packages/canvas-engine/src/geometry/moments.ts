import type { Vec2 } from './segment.js';

/**
 * Statistical descriptions of a point cloud.
 *
 * These say nothing about the order points were visited in — they treat a
 * stroke as a cloud of samples and ask how that cloud is shaped. That is
 * exactly what makes them useful for reading a hand-drawn stroke: the answer
 * does not change when the same outline is drawn clockwise, anticlockwise, or
 * starting from a different corner.
 */

/** The two perpendicular directions a cloud is most and least spread along. */
export interface PrincipalAxes {
  readonly centre: Vec2;
  /** Unit vector along the direction of greatest spread. */
  readonly major: Vec2;
  /** Variance along `major`. Always the larger of the two. */
  readonly majorVariance: number;
  /** Variance perpendicular to `major`. */
  readonly minorVariance: number;
}

function centroid(points: readonly Vec2[]): Vec2 {
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
  }
  return [sumX / points.length, sumY / points.length];
}

/**
 * The eigen-decomposition of the cloud's covariance matrix.
 *
 * Closed form rather than an iterative solver: a 2x2 symmetric matrix has its
 * eigenvalues in one square root, and this runs on every pointer move.
 */
export function principalAxes(points: readonly Vec2[]): PrincipalAxes {
  const centre = centroid(points);
  const [cx, cy] = centre;

  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  xx /= points.length;
  yy /= points.length;
  xy /= points.length;

  const mean = (xx + yy) / 2;
  const half = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
  const majorVariance = mean + half;
  const minorVariance = mean - half;

  // With no covariance the axes are the coordinate axes themselves, and the
  // eigenvector formula below degenerates to (0, 0).
  if (xy === 0) {
    return {
      centre,
      major: xx >= yy ? [1, 0] : [0, 1],
      majorVariance,
      minorVariance,
    };
  }

  const ex = majorVariance - yy;
  const ey = xy;
  const length = Math.hypot(ex, ey);
  return { centre, major: [ex / length, ey / length], majorVariance, minorVariance };
}

/**
 * How thin the cloud is: the spread across its major axis over the spread
 * along it. 0 for points on a perfect straight line, 1 for a circle.
 *
 * A ratio of standard deviations rather than of variances, so it stays a
 * linear measure of thinness — squaring it would flatter a bent stroke by
 * pushing every middling value toward zero.
 */
export function axisSpreadRatio(axes: PrincipalAxes): number {
  if (axes.majorVariance === 0) return 0;
  return Math.sqrt(axes.minorVariance / axes.majorVariance);
}

/** Each point's signed distance along the major axis from the centre. */
export function projectOnMajorAxis(points: readonly Vec2[], axes: PrincipalAxes): number[] {
  const [cx, cy] = axes.centre;
  const [mx, my] = axes.major;
  return points.map(([x, y]) => (x - cx) * mx + (y - cy) * my);
}

/**
 * The `order`-th standardised moment of `values`: the mean of the deviations
 * raised to `order`, divided by the standard deviation to the same power.
 *
 * Dividing out the spread is what makes the result scale-free, so the same
 * figure drawn large and small measures the same.
 */
function standardisedMoment(values: readonly number[], order: number): number {
  let mean = 0;
  for (const value of values) mean += value;
  mean /= values.length;

  let variance = 0;
  let raised = 0;
  for (const value of values) {
    const deviation = value - mean;
    variance += deviation * deviation;
    raised += deviation ** order;
  }
  variance /= values.length;
  raised /= values.length;

  if (variance === 0) return 0;
  return raised / variance ** (order / 2);
}

/** Lopsidedness. 0 when the values are symmetric about their mean. */
export function skewness(values: readonly number[]): number {
  return standardisedMoment(values, 3);
}

/**
 * How much of the spread sits out at the extremes rather than near the mean.
 *
 * Low for values pushed to the ends (1.0 for two equal clumps), 1.8 for a flat
 * spread, 3.0 for a normal distribution.
 */
export function kurtosis(values: readonly number[]): number {
  return standardisedMoment(values, 4);
}
