import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Drawable, Options } from 'roughjs/bin/core';
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

export function generateRectangleDrawable(rc: RoughCanvas, shape: RectangleShape): Drawable {
  if (shape.edges === 'round') {
    return rc.generator.path(
      roundedRectPath(shape.x, shape.y, shape.width, shape.height),
      baseOptions(shape),
    );
  }
  return rc.generator.rectangle(shape.x, shape.y, shape.width, shape.height, baseOptions(shape));
}

export function generateEllipseDrawable(rc: RoughCanvas, shape: EllipseShape): Drawable {
  return rc.generator.ellipse(
    shape.x + shape.width / 2,
    shape.y + shape.height / 2,
    shape.width,
    shape.height,
    baseOptions(shape),
  );
}

export function generateDiamondDrawable(rc: RoughCanvas, shape: DiamondShape): Drawable {
  const points = diamondPoints(shape);
  if (shape.edges === 'round') {
    return rc.generator.path(roundedPolygonPath(points), baseOptions(shape));
  }
  return rc.generator.polygon(points as Array<[number, number]>, baseOptions(shape));
}

export function generateLineDrawable(rc: RoughCanvas, shape: LineShape): Drawable {
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
  rc: RoughCanvas,
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

export function generateArrowDrawable(rc: RoughCanvas, shape: ArrowShape): Drawable {
  const absPoints = arrowRenderPoints(shape);
  return shape.arrowType === 'curved'
    ? rc.generator.curve(absPoints, baseOptions(shape))
    : rc.generator.linearPath(absPoints, baseOptions(shape));
}

export function generateFreehandDrawable(rc: RoughCanvas, shape: FreehandShape): Drawable {
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

/**
 * Freehand rendered as a tapered stroke: each segment is stroked at its own
 * width, thin at both ends and full through the middle, so the line reads as
 * though drawn with varying pressure. Round caps hide the seams.
 */
export function drawFreehandPressure(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: FreehandShape,
): void {
  const pts = absolutePoints(shape);
  if (pts.length < 2) return;

  ctx.save();
  ctx.strokeStyle = shape.strokeColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const dash = dashArray(shape.strokeStyle, shape.strokeWidth);
  if (dash) ctx.setLineDash(dash);

  const segments = pts.length - 1;
  for (let i = 0; i < segments; i++) {
    const from = pts[i]!;
    const to = pts[i + 1]!;
    // sin() peaks at the midpoint and reaches zero at both ends; the floor
    // keeps the tips visible rather than vanishing.
    const t = (i + 0.5) / segments;
    const taper = 0.35 + 0.65 * Math.sin(Math.PI * t);

    ctx.lineWidth = shape.strokeWidth * taper;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
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
 * Draw arrowheads on an arrow shape. Called after the line itself
 * has been drawn via generateArrowDrawable + drawShape.
 */
export function drawArrowheads(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ArrowShape,
): void {
  const pts = arrowRenderPoints(shape);
  if (pts.length < 2) return;

  const length = polylineLength(pts);

  ctx.save();
  ctx.fillStyle = shape.strokeColor;
  ctx.strokeStyle = shape.strokeColor;
  ctx.lineWidth = shape.strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Arrowheads are solid markers even on a dashed arrow.
  ctx.setLineDash([]);

  const end = pts[pts.length - 1]!;
  const beforeEnd = pts[pts.length - 2]!;
  drawArrowhead(ctx, shape, shape.endArrowhead, beforeEnd, end, length);

  const start = pts[0]!;
  const afterStart = pts[1]!;
  drawArrowhead(ctx, shape, shape.startArrowhead, afterStart, start, length);

  ctx.restore();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ArrowShape,
  arrowhead: Arrowhead,
  from: readonly [number, number],
  tip: readonly [number, number],
  arrowLength: number,
): void {
  if (arrowhead === 'none') return;

  const [tx, ty] = tip;
  const distance = Math.hypot(tx - from[0], ty - from[1]);
  if (distance === 0) return;

  const { size, angle, lengthRatio } = ARROWHEAD_GEOMETRY[arrowhead];
  const nx = (tx - from[0]) / distance;
  const ny = (ty - from[1]) / distance;
  const minSize = Math.min(size, arrowLength * lengthRatio);

  // Base point: back along the shaft from the tip.
  const bx = tx - nx * minSize;
  const by = ty - ny * minSize;

  if (arrowhead === 'circle' || arrowhead === 'circle_outline') {
    const radius = (Math.hypot(by - ty, bx - tx) + shape.strokeWidth - 2) / 2;
    if (radius <= 0) return;
    ctx.beginPath();
    ctx.arc(tx, ty, radius, 0, Math.PI * 2);
    if (arrowhead === 'circle') {
      ctx.fill();
    } else {
      ctx.stroke();
    }
    return;
  }

  const radians = (angle * Math.PI) / 180;
  const [w1x, w1y] = rotateAround(bx, by, tx, ty, -radians);
  const [w2x, w2y] = rotateAround(bx, by, tx, ty, radians);

  if (arrowhead === 'arrow' || arrowhead === 'bar') {
    // Open marker: two strokes from the tip, no enclosed area to fill.
    ctx.beginPath();
    ctx.moveTo(w1x, w1y);
    ctx.lineTo(tx, ty);
    ctx.lineTo(w2x, w2y);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(w1x, w1y);

  if (arrowhead === 'diamond' || arrowhead === 'diamond_outline') {
    // Fourth corner, mirrored through the tip from the base point.
    ctx.lineTo(tx - nx * minSize * 2, ty - ny * minSize * 2);
  }

  ctx.lineTo(w2x, w2y);
  ctx.closePath();

  if (arrowhead === 'triangle_outline' || arrowhead === 'diamond_outline') {
    ctx.stroke();
  } else {
    ctx.fill();
  }
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
