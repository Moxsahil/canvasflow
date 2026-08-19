import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { RoughGenerator } from 'roughjs/bin/generator';
import type {
  RectangleShape,
  EllipseShape,
  DiamondShape,
  LineShape,
  ArrowShape,
  FreehandShape,
  BaseShape,
} from '../shapes/shape.js';
import type { Arrowhead, StrokeStyle } from '../shapes/style.js';
import { ARROWHEAD_GEOMETRY } from '../shapes/style.js';
import { diamondPoints } from '../shapes/diamond.js';
import { isPathALoop, simplifyPoints } from './simplify.js';

/**
 * What the drawable generators actually need. RoughCanvas satisfies it, and so
 * does RoughGenerator on its own — which is how the SVG renderer reuses the
 * canvas renderer's geometry rather than reimplementing every shape.
 */
export interface RoughDrawableSource {
  readonly generator: RoughGenerator;
}

/** A generator with no canvas behind it — all the SVG renderer needs. */
export function createRoughGenerator(): RoughGenerator {
  return rough.generator();
}

export function createRoughCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): RoughCanvas {
  // roughjs types only accept HTMLCanvasElement but the implementation only uses
  // the shared canvas API, so OffscreenCanvas works at runtime.
  return rough.canvas(canvas as HTMLCanvasElement);
}

/** Largest corner radius a rounded shape will use, however big it grows. */
const MAX_CORNER_RADIUS = 32;
/** Fraction of the shorter side used as the corner radius below that cap. */
const CORNER_RADIUS_RATIO = 0.25;

/**
 * Dash pattern for a stroke style. Both patterns scale with stroke width so a
 * thick dashed line doesn't read as solid.
 */
export function strokeDashArray(
  strokeStyle: StrokeStyle,
  strokeWidth: number,
): number[] | undefined {
  return dashArray(strokeStyle, strokeWidth);
}

function dashArray(strokeStyle: StrokeStyle, strokeWidth: number): number[] | undefined {
  switch (strokeStyle) {
    case 'dashed':
      return [8, 8 + strokeWidth];
    case 'dotted':
      return [1.5, 6 + strokeWidth];
    case 'solid':
      return undefined;
  }
}

/** Common Rough.js options derived from a shape. */
function baseOptions(shape: BaseShape): Options {
  const lineDash = dashArray(shape.strokeStyle, shape.strokeWidth);
  return {
    seed: shape.seed,
    stroke: shape.strokeColor,
    strokeWidth: shape.strokeWidth,
    fill: shape.fillColor ?? undefined,
    fillStyle: shape.fillColor ? shape.fillStyle : undefined,
    roughness: shape.roughness,
    ...(lineDash && { strokeLineDash: lineDash }),
  };
}

function cornerRadius(width: number, height: number): number {
  return Math.min(Math.abs(width), Math.abs(height)) * CORNER_RADIUS_RATIO;
}

/** SVG path for a rectangle with rounded corners, tolerant of negative sizes. */
function roundedRectPath(x: number, y: number, width: number, height: number): string {
  const left = width < 0 ? x + width : x;
  const top = height < 0 ? y + height : y;
  const w = Math.abs(width);
  const h = Math.abs(height);
  const r = Math.min(cornerRadius(w, h), MAX_CORNER_RADIUS);
  const right = left + w;
  const bottom = top + h;

  return [
    `M ${left + r} ${top}`,
    `L ${right - r} ${top}`,
    `Q ${right} ${top} ${right} ${top + r}`,
    `L ${right} ${bottom - r}`,
    `Q ${right} ${bottom} ${right - r} ${bottom}`,
    `L ${left + r} ${bottom}`,
    `Q ${left} ${bottom} ${left} ${bottom - r}`,
    `L ${left} ${top + r}`,
    `Q ${left} ${top} ${left + r} ${top}`,
    'Z',
  ].join(' ');
}

/**
 * SVG path for a closed polygon whose vertices are rounded off. Each corner is
 * cut back along both its edges and bridged with a quadratic through the
 * original vertex.
 */
function roundedPolygonPath(points: ReadonlyArray<readonly [number, number]>): string {
  const n = points.length;
  if (n < 3) return '';

  const segments: string[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;

    const toPrev = [prev[0] - curr[0], prev[1] - curr[1]] as const;
    const toNext = [next[0] - curr[0], next[1] - curr[1]] as const;
    const prevLen = Math.hypot(toPrev[0], toPrev[1]) || 1;
    const nextLen = Math.hypot(toNext[0], toNext[1]) || 1;

    // Never cut back past the midpoint of an edge, or adjacent corners collide.
    const r = Math.min(MAX_CORNER_RADIUS, prevLen / 2, nextLen / 2, prevLen * CORNER_RADIUS_RATIO);

    const start = [curr[0] + (toPrev[0] / prevLen) * r, curr[1] + (toPrev[1] / prevLen) * r];
    const end = [curr[0] + (toNext[0] / nextLen) * r, curr[1] + (toNext[1] / nextLen) * r];

    segments.push(
      i === 0 ? `M ${start[0]} ${start[1]}` : `L ${start[0]} ${start[1]}`,
      `Q ${curr[0]} ${curr[1]} ${end[0]} ${end[1]}`,
    );
  }

  segments.push('Z');
  return segments.join(' ');
}

/** Shape-relative points lifted into absolute canvas coordinates. */
function absolutePoints(shape: {
  x: number;
  y: number;
  points: ReadonlyArray<readonly [number, number]>;
}): Array<[number, number]> {
  return shape.points.map(([px, py]) => [shape.x + px, shape.y + py] as [number, number]);
}

/**
 * The points an arrow is actually drawn through, which differ from its stored
 * points for elbow arrows. Arrowheads read from this too, so they stay aligned
 * with the last rendered segment rather than the stored one.
 */
export function arrowRenderPoints(shape: ArrowShape): Array<[number, number]> {
  const pts = absolutePoints(shape);
  if (shape.arrowType !== 'elbow' || pts.length < 2) return pts;

  // Route as one horizontal run then one vertical run.
  const start = pts[0]!;
  const end = pts[pts.length - 1]!;
  const corner: [number, number] = [end[0], start[1]];
  return [start, corner, end];
}

// --- Drawable generators ---

export function generateRectangleDrawable(
  rc: RoughDrawableSource,
  shape: RectangleShape,
): Drawable {
  if (shape.edges === 'round') {
    return rc.generator.path(
      roundedRectPath(shape.x, shape.y, shape.width, shape.height),
      baseOptions(shape),
    );
  }
  return rc.generator.rectangle(shape.x, shape.y, shape.width, shape.height, baseOptions(shape));
}

export function generateEllipseDrawable(rc: RoughDrawableSource, shape: EllipseShape): Drawable {
  return rc.generator.ellipse(
    shape.x + shape.width / 2,
    shape.y + shape.height / 2,
    shape.width,
    shape.height,
    baseOptions(shape),
  );
}

export function generateDiamondDrawable(rc: RoughDrawableSource, shape: DiamondShape): Drawable {
  const points = diamondPoints(shape);
  if (shape.edges === 'round') {
    return rc.generator.path(roundedPolygonPath(points), baseOptions(shape));
  }
  return rc.generator.polygon(points as Array<[number, number]>, baseOptions(shape));
}

export function generateLineDrawable(rc: RoughDrawableSource, shape: LineShape): Drawable {
  const absPoints = absolutePoints(shape);
  const options = baseOptions(shape);
  // Round edges curve through the points rather than joining them straight.
  if (shape.edges === 'round') {
    return rc.generator.curve(absPoints, options);
  }
  // A fill needs an enclosed area, so a filled line closes into a polygon —
  // an open linearPath has no interior to hatch.
  return shape.fillColor
    ? rc.generator.polygon(absPoints, options)
    : rc.generator.linearPath(absPoints, options);
}

/**
 * The backing fill for a freehand stroke, or null when there's nothing to fill.
 *
 * Only closed strokes get one, and the outline is simplified first: a gesture
 * carries hundreds of points and hatching across all of them is slow. Drawn
 * with no stroke of its own, since the real stroke paints over the top.
 */
export function generateFreehandFillDrawable(
  rc: RoughDrawableSource,
  shape: FreehandShape,
): Drawable | null {
  if (!shape.fillColor || !isPathALoop(shape.points)) return null;
  const simplified = simplifyPoints(shape.points).map(
    ([px, py]) => [shape.x + px, shape.y + py] as [number, number],
  );
  if (simplified.length < 3) return null;
  return rc.generator.curve(simplified, {
    ...baseOptions(shape),
    stroke: 'none',
  });
}

export function generateArrowDrawable(rc: RoughDrawableSource, shape: ArrowShape): Drawable {
  const absPoints = arrowRenderPoints(shape);
  return shape.arrowType === 'curved'
    ? rc.generator.curve(absPoints, baseOptions(shape))
    : rc.generator.linearPath(absPoints, baseOptions(shape));
}

export function generateFreehandDrawable(rc: RoughDrawableSource, shape: FreehandShape): Drawable {
  const options: Options = {
    ...baseOptions(shape),
    // Freehand is already an organic line; full roughness turns it to mush.
    roughness: shape.roughness * 0.5,
  };
  if (shape.points.length < 2) {
    return rc.generator.linearPath([[shape.x, shape.y]], options);
  }
  const absPoints = absolutePoints(shape);
  return shape.edges === 'round'
    ? rc.generator.curve(absPoints, options)
    : rc.generator.linearPath(absPoints, options);
}

// --- The draw call ---

export function drawShape(rc: RoughCanvas, drawable: Drawable): void {
  rc.draw(drawable);
}

/** One segment of a tapered freehand stroke, at its own width. */
export interface TaperedSegment {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly width: number;
}

/**
 * Freehand as a tapered stroke: each segment carries its own width, thin at
 * both ends and full through the middle, so the line reads as though drawn
 * with varying pressure.
 *
 * Returned as geometry rather than drawn, so the canvas and SVG renderers
 * taper identically instead of each carrying a copy of the maths.
 */
export function freehandPressureSegments(shape: FreehandShape): TaperedSegment[] {
  const pts = absolutePoints(shape);
  if (pts.length < 2) return [];

  const segments = pts.length - 1;
  const out: TaperedSegment[] = [];
  for (let i = 0; i < segments; i++) {
    // sin() peaks at the midpoint and reaches zero at both ends; the floor
    // keeps the tips visible rather than vanishing.
    const t = (i + 0.5) / segments;
    const taper = 0.35 + 0.65 * Math.sin(Math.PI * t);
    out.push({ from: pts[i]!, to: pts[i + 1]!, width: shape.strokeWidth * taper });
  }
  return out;
}

/** Round caps hide the seams between the segments. */
export function drawFreehandPressure(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: FreehandShape,
): void {
  const segments = freehandPressureSegments(shape);
  if (segments.length === 0) return;

  ctx.save();
  ctx.strokeStyle = shape.strokeColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const dash = dashArray(shape.strokeStyle, shape.strokeWidth);
  if (dash) ctx.setLineDash(dash);

  for (const segment of segments) {
    ctx.lineWidth = segment.width;
    ctx.beginPath();
    ctx.moveTo(segment.from[0], segment.from[1]);
    ctx.lineTo(segment.to[0], segment.to[1]);
    ctx.stroke();
  }

  ctx.restore();
}

/** Total length along a polyline, used to cap arrowheads on short arrows. */
function polylineLength(points: ReadonlyArray<readonly [number, number]>): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** Rotate (px, py) around (cx, cy) by `radians`. */
function rotateAround(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radians: number,
): [number, number] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/**
 * One arrowhead, described rather than drawn.
 *
 * `open` is a stroked polyline with no enclosed area (a plain arrow or bar);
 * `closed` is a polygon that is either filled or outlined; `circle` is a dot or
 * ring at the tip. Splitting the maths out this way is what lets the SVG
 * renderer produce the same markers as the canvas one.
 */
export type ArrowheadMark =
  | {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly radius: number;
      readonly filled: boolean;
    }
  | { readonly kind: 'open'; readonly points: ReadonlyArray<readonly [number, number]> }
  | {
      readonly kind: 'closed';
      readonly points: ReadonlyArray<readonly [number, number]>;
      readonly filled: boolean;
    };

function arrowheadMark(
  shape: ArrowShape,
  arrowhead: Arrowhead,
  from: readonly [number, number],
  tip: readonly [number, number],
  arrowLength: number,
): ArrowheadMark | null {
  if (arrowhead === 'none') return null;

  const [tx, ty] = tip;
  const distance = Math.hypot(tx - from[0], ty - from[1]);
  if (distance === 0) return null;

  const { size, angle, lengthRatio } = ARROWHEAD_GEOMETRY[arrowhead];
  const nx = (tx - from[0]) / distance;
  const ny = (ty - from[1]) / distance;
  const minSize = Math.min(size, arrowLength * lengthRatio);

  // Base point: back along the shaft from the tip.
  const bx = tx - nx * minSize;
  const by = ty - ny * minSize;

  if (arrowhead === 'circle' || arrowhead === 'circle_outline') {
    const radius = (Math.hypot(by - ty, bx - tx) + shape.strokeWidth - 2) / 2;
    if (radius <= 0) return null;
    return { kind: 'circle', cx: tx, cy: ty, radius, filled: arrowhead === 'circle' };
  }

  const radians = (angle * Math.PI) / 180;
  const wing1 = rotateAround(bx, by, tx, ty, -radians);
  const wing2 = rotateAround(bx, by, tx, ty, radians);

  if (arrowhead === 'arrow' || arrowhead === 'bar') {
    return { kind: 'open', points: [wing1, [tx, ty], wing2] };
  }

  const points: Array<readonly [number, number]> = [[tx, ty], wing1];
  if (arrowhead === 'diamond' || arrowhead === 'diamond_outline') {
    // Fourth corner, mirrored through the tip from the base point.
    points.push([tx - nx * minSize * 2, ty - ny * minSize * 2]);
  }
  points.push(wing2);

  return {
    kind: 'closed',
    points,
    filled: arrowhead !== 'triangle_outline' && arrowhead !== 'diamond_outline',
  };
}

/** Both ends of an arrow, as geometry. Empty when neither end has a marker. */
export function arrowheadMarks(shape: ArrowShape): ArrowheadMark[] {
  const pts = arrowRenderPoints(shape);
  if (pts.length < 2) return [];

  const length = polylineLength(pts);
  const marks: ArrowheadMark[] = [];

  const end = arrowheadMark(
    shape,
    shape.endArrowhead,
    pts[pts.length - 2]!,
    pts[pts.length - 1]!,
    length,
  );
  if (end) marks.push(end);

  const start = arrowheadMark(shape, shape.startArrowhead, pts[1]!, pts[0]!, length);
  if (start) marks.push(start);

  return marks;
}

/**
 * Draw arrowheads on an arrow shape. Called after the line itself
 * has been drawn via generateArrowDrawable + drawShape.
 */
export function drawArrowheads(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ArrowShape,
): void {
  const marks = arrowheadMarks(shape);
  if (marks.length === 0) return;

  ctx.save();
  ctx.fillStyle = shape.strokeColor;
  ctx.strokeStyle = shape.strokeColor;
  ctx.lineWidth = shape.strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Arrowheads are solid markers even on a dashed arrow.
  ctx.setLineDash([]);

  for (const mark of marks) {
    if (mark.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(mark.cx, mark.cy, mark.radius, 0, Math.PI * 2);
      if (mark.filled) ctx.fill();
      else ctx.stroke();
      continue;
    }

    ctx.beginPath();
    const [first, ...rest] = mark.points;
    ctx.moveTo(first![0], first![1]);
    for (const [px, py] of rest) ctx.lineTo(px, py);

    if (mark.kind === 'open') {
      ctx.stroke();
      continue;
    }

    ctx.closePath();
    if (mark.filled) ctx.fill();
    else ctx.stroke();
  }

  ctx.restore();
}

export function drawText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: {
    x: number;
    y: number;
    text: string;
    fontSize: number;
    fontFamily: string;
    textAlign: 'left' | 'center' | 'right';
    strokeColor: string;
  },
): void {
  ctx.save();
  ctx.fillStyle = shape.strokeColor;
  ctx.font = `${shape.fontSize}px ${shape.fontFamily}`;
  ctx.textAlign = shape.textAlign;
  ctx.textBaseline = 'top';

  const lines = shape.text.split('\n');
  const lineHeight = shape.fontSize * 1.2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined) {
      ctx.fillText(line, shape.x, shape.y + i * lineHeight);
    }
  }

  ctx.restore();
}
