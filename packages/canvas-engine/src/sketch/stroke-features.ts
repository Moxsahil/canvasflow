import { pointSegmentDistanceSq, type Vec2 } from '../geometry/segment.js';
import { convexHull, polygonArea } from '../geometry/hull.js';
import {
  axisSpreadRatio,
  kurtosis,
  principalAxes,
  projectOnMajorAxis,
  skewness,
} from '../geometry/moments.js';

/**
 * The measurements a rough stroke is judged on.
 *
 * All seven are scale-free, so the same gesture drawn large or small, fast or
 * slow, reads the same. Rotation is a different matter and deliberately so:
 * `boxFill` and `spreadProduct` are measured against the screen axes, because
 * a square turned by 45 degrees is a diamond and must not be read as a
 * rectangle standing on its corner.
 */
export interface StrokeFeatures {
  /**
   * The gap between the two ends over the length of the path between them.
   * Near 0 when the stroke came back to where it started, which is what
   * separates an outline from a mark.
   */
  readonly closureGap: number;

  /**
   * How thin the stroke's point cloud is. Near 0 for anything straight.
   */
  readonly axisSpreadRatio: number;

  /**
   * Lopsidedness of the points along their own long axis. An arrowhead piles
   * up samples at one end, which nothing else in a straight stroke does.
   */
  readonly axisSkew: number;

  /**
   * Area of the stroke's convex hull over the area of its bounding box: 1 for
   * a rectangle, PI/4 for an ellipse, 1/2 for a diamond.
   */
  readonly boxFill: number;

  /**
   * The share of all the turning in the stroke that happens at its four
   * sharpest corners.
   *
   * Near 1 for any quadrilateral, however skewed — all of its turning is at
   * the corners by definition. Near 1/2 for an ellipse, whose turning is
   * spread evenly around the outline. This is the measurement that tells a
   * lazily tapered rectangle from an ellipse, since both can fill about the
   * same fraction of their box.
   */
  readonly cornerShare: number;

  /**
   * How lopsided the samples are on the screen axes — the larger of the two
   * skews, across and down.
   *
   * Near 0 for a rectangle, an ellipse and a diamond alike, since all three
   * are symmetric about both axes. This is what a triangle has no answer for:
   * it fills half its box and spreads its samples along each axis almost
   * exactly as a diamond does, so every other measurement here reads it as
   * one. What gives it away is having all its weight along one edge.
   */
  readonly axisLopsidedness: number;

  /**
   * Kurtosis across the stroke multiplied by kurtosis down it.
   *
   * Each factor alone moves with the aspect ratio; the product barely does,
   * which is what makes one number enough. The values it separates are the
   * exact moments of the outlines themselves: a rectangle puts half its
   * samples at the extremes of each axis and spreads the rest flat, giving
   * 1.35 per axis and 1.83 together; an ellipse traces a cosine, giving 1.5
   * and 2.25; a diamond spreads flat on both axes, giving 1.8 and 3.24.
   */
  readonly spreadProduct: number;

  /**
   * How far the stroke wanders from the straight line between where it began
   * and the point it reached furthest from there, as a fraction of that
   * distance.
   *
   * Samples near that far point are exempt, so an arrowhead does not count as
   * wandering. Elbows, arcs and zigzags can all pass for straight on their
   * point statistics alone; this is the check that reads their actual path.
   */
  readonly chordDrift: number;
}

/**
 * How many evenly spaced samples every stroke is reduced to before measuring.
 *
 * Resampling is not an optimisation — it is what makes the measurements mean
 * anything. Raw pointer samples bunch up wherever the hand slowed down, so
 * without it every feature would be weighted by drawing speed, and a corner
 * taken carefully would count for more than a side swept quickly.
 */
const SAMPLE_COUNT = 64;

/**
 * How far apart, in samples, the two chords meeting at a turn are taken.
 *
 * Wide enough to look past pen wobble, narrow enough that two corners of a
 * small quadrilateral stay separate peaks rather than merging into one.
 */
const TURN_SPAN = 3;

/** Corners a quadrilateral has, and so how many turn peaks are looked for. */
const CORNER_COUNT = 4;

/**
 * The fraction of the stroke's reach, measured back from its furthest point,
 * within which samples are excused from the straightness check — enough room
 * for an arrowhead of any reasonable size.
 */
const TIP_EXEMPTION = 0.5;

/** The point of `points` lying furthest from `origin`. */
export function farthestFrom(points: readonly Vec2[], origin: Vec2): Vec2 {
  let farthest = origin;
  let reach = -1;
  for (const point of points) {
    const distance = Math.hypot(point[0] - origin[0], point[1] - origin[1]);
    if (distance > reach) {
      reach = distance;
      farthest = point;
    }
  }
  return farthest;
}

function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  }
  return total;
}

/** `points` redrawn as `count` samples spaced evenly along the same path. */
function resample(points: readonly Vec2[], count: number): Vec2[] {
  const total = pathLength(points);
  const first = points[0]!;
  if (total === 0) return new Array<Vec2>(count).fill(first);

  const step = total / (count - 1);
  const samples: Vec2[] = [first];
  /** Distance from the start of the path to `points[i - 1]`. */
  let covered = 0;
  /** Distance at which the next sample falls due. */
  let due = step;

  for (let i = 1; i < points.length && samples.length < count; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (span === 0) continue;

    while (due <= covered + span && samples.length < count) {
      const t = (due - covered) / span;
      samples.push([from[0] + t * (to[0] - from[0]), from[1] + t * (to[1] - from[1])]);
      due += step;
    }
    covered += span;
  }

  // Rounding can leave the last sample or two owed. The path ends where it
  // ends, so that is what they get.
  const last = points[points.length - 1]!;
  while (samples.length < count) samples.push(last);
  return samples;
}

/**
 * The angle turned at each sample, between the chord arriving at it and the
 * chord leaving it.
 *
 * The stroke is read as an open path even when it closes, deliberately. Joining
 * the last sample back to the first would turn the overshoot or shortfall where
 * a hand-drawn outline meets itself into a sharp corner nobody drew.
 */
function turnAngles(samples: readonly Vec2[]): number[] {
  const turns: number[] = [];
  for (let i = TURN_SPAN; i < samples.length - TURN_SPAN; i++) {
    const [ax, ay] = samples[i - TURN_SPAN]!;
    const [bx, by] = samples[i]!;
    const [cx, cy] = samples[i + TURN_SPAN]!;
    const inX = bx - ax;
    const inY = by - ay;
    const outX = cx - bx;
    const outY = cy - by;
    turns.push(Math.abs(Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY)));
  }
  return turns;
}

/**
 * How much turning each of the four sharpest corners accounts for, strongest
 * first.
 *
 * Peaks are taken greedily, each claiming the samples within `TURN_SPAN` of
 * it, so one physical corner — whose turn smears across the width of the
 * window — is counted once rather than four times.
 */
function cornerTurns(turns: readonly number[]): number[] {
  const claimed = new Array<boolean>(turns.length).fill(false);
  const corners: number[] = [];

  for (let corner = 0; corner < CORNER_COUNT; corner++) {
    let peak = -1;
    let sharpest = 0;
    for (let i = 0; i < turns.length; i++) {
      if (!claimed[i] && turns[i]! > sharpest) {
        sharpest = turns[i]!;
        peak = i;
      }
    }
    if (peak < 0) break;

    const from = Math.max(0, peak - TURN_SPAN);
    const to = Math.min(turns.length - 1, peak + TURN_SPAN);
    let claimedTurn = 0;
    for (let i = from; i <= to; i++) {
      if (claimed[i]) continue;
      claimedTurn += turns[i]!;
      claimed[i] = true;
    }
    corners.push(claimedTurn);
  }

  return corners;
}

/** See {@link StrokeFeatures.chordDrift}. */
function chordDrift(samples: readonly Vec2[]): number {
  const start = samples[0]!;
  const tip = farthestFrom(samples, start);
  const reach = Math.hypot(tip[0] - start[0], tip[1] - start[1]);
  if (reach === 0) return 0;

  let drift = 0;
  for (const sample of samples) {
    const toTip = Math.hypot(sample[0] - tip[0], sample[1] - tip[1]);
    if (toTip <= TIP_EXEMPTION * reach) continue;
    drift = Math.max(drift, pointSegmentDistanceSq(sample, start, tip));
  }
  return Math.sqrt(drift) / reach;
}

/** Measure a stroke. Needs at least two points. */
export function strokeFeatures(points: readonly Vec2[]): StrokeFeatures {
  const samples = resample(points, SAMPLE_COUNT);

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const length = pathLength(samples);
  const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);

  const axes = principalAxes(samples);

  const turns = turnAngles(samples);
  let turned = 0;
  for (const turn of turns) turned += turn;
  const corners = cornerTurns(turns);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of samples) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const boxArea = (maxX - minX) * (maxY - minY);

  const across = samples.map(([x]) => x);
  const down = samples.map(([, y]) => y);

  return {
    closureGap: length > 0 ? gap / length : 0,
    axisSpreadRatio: axisSpreadRatio(axes),
    axisSkew: skewness(projectOnMajorAxis(samples, axes)),
    boxFill: boxArea > 0 ? polygonArea(convexHull(samples)) / boxArea : 0,
    cornerShare: turned > 0 ? corners.reduce((sum, turn) => sum + turn, 0) / turned : 0,
    axisLopsidedness: Math.max(Math.abs(skewness(across)), Math.abs(skewness(down))),
    spreadProduct: kurtosis(across) * kurtosis(down),
    chordDrift: chordDrift(samples),
  };
}
