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
} from '../shapes/shape.js';
import { diamondPoints } from '../shapes/diamond.js';

export function createRoughCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): RoughCanvas {
  // roughjs types only accept HTMLCanvasElement but the implementation only uses
  // the shared canvas API, so OffscreenCanvas works at runtime.
  return rough.canvas(canvas as HTMLCanvasElement);
}

/** Common Rough.js options derived from a shape. */
function baseOptions(shape: {
  seed: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string | null;
}): Options {
  return {
    seed: shape.seed,
    stroke: shape.strokeColor,
    strokeWidth: shape.strokeWidth,
    fill: shape.fillColor ?? undefined,
    fillStyle: shape.fillColor ? 'hachure' : undefined,
    roughness: 1,
  };
}

// --- Drawable generators ---

export function generateRectangleDrawable(rc: RoughCanvas, shape: RectangleShape): Drawable {
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
  return rc.generator.polygon(diamondPoints(shape) as Array<[number, number]>, baseOptions(shape));
}

export function generateLineDrawable(rc: RoughCanvas, shape: LineShape): Drawable {
  const absPoints = shape.points.map(
    ([px, py]) => [shape.x + px, shape.y + py] as [number, number],
  );
  // Rough's linearPath draws connected segments
  return rc.generator.linearPath(absPoints, baseOptions(shape));
}

export function generateArrowDrawable(rc: RoughCanvas, shape: ArrowShape): Drawable {
  // For PR #13 the arrow draws as a line. Arrowheads come as a separate
  // ctx.lineTo call in the renderer (Rough doesn't natively do arrowheads
  // with the hand-drawn aesthetic — we'll layer them manually).
  const absPoints = shape.points.map(
    ([px, py]) => [shape.x + px, shape.y + py] as [number, number],
  );
  return rc.generator.linearPath(absPoints, baseOptions(shape));
}

export function generateFreehandDrawable(rc: RoughCanvas, shape: FreehandShape): Drawable {
  if (shape.points.length < 2)
    return rc.generator.linearPath([[shape.x, shape.y]], baseOptions(shape));
  const absPoints = shape.points.map(
    ([px, py]) => [shape.x + px, shape.y + py] as [number, number],
  );
  // Freehand uses curve generator for smooth strokes
  return rc.generator.curve(absPoints, {
    ...baseOptions(shape),
    roughness: 0.5, // less roughness for smoother freehand
  });
}

// --- The draw call ---

export function drawShape(rc: RoughCanvas, drawable: Drawable): void {
  rc.draw(drawable);
}

/**
 * Draw arrowheads on an arrow shape. Called after the line itself
 * has been drawn via generateArrowDrawable + drawShape.
 */
export function drawArrowheads(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ArrowShape,
): void {
  if (shape.points.length < 2) return;

  ctx.save();
  ctx.fillStyle = shape.strokeColor;
  ctx.strokeStyle = shape.strokeColor;
  ctx.lineWidth = shape.strokeWidth;

  if (shape.endArrowhead === 'triangle') {
    const lastIdx = shape.points.length - 1;
    const prev = shape.points[lastIdx - 1];
    const end = shape.points[lastIdx];
    if (prev && end) {
      drawTriangleArrowhead(
        ctx,
        shape.x + prev[0],
        shape.y + prev[1],
        shape.x + end[0],
        shape.y + end[1],
      );
    }
  }

  if (shape.startArrowhead === 'triangle') {
    const start = shape.points[0];
    const next = shape.points[1];
    if (start && next) {
      drawTriangleArrowhead(
        ctx,
        shape.x + next[0],
        shape.y + next[1],
        shape.x + start[0],
        shape.y + start[1],
      );
    }
  }

  ctx.restore();
}

/** Draw a small filled triangle at (toX, toY) pointing away from (fromX, fromY). */
function drawTriangleArrowhead(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const size = 12;
  const wing = 0.5; // controls spread

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(angle - wing), toY - size * Math.sin(angle - wing));
  ctx.lineTo(toX - size * Math.cos(angle + wing), toY - size * Math.sin(angle + wing));
  ctx.closePath();
  ctx.fill();
}

/**
 * Text doesn't use Rough.js. Renders directly to the 2D context with
 * the configured font.
 */
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
