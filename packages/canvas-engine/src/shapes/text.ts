import type { TextShape } from './shape.js';
import type { Rect } from '../math.js';

export const DEFAULT_FONT_FAMILY = '"Caveat", "Comic Sans MS", system-ui, sans-serif';
export const DEFAULT_FONT_SIZE = 20;

export function createText(input: {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  strokeColor?: string;
  rotation?: number;
  seed?: number;
}): TextShape {
  return {
    kind: 'text',
    id: input.id,
    x: input.x,
    y: input.y,
    text: input.text,
    fontSize: input.fontSize ?? DEFAULT_FONT_SIZE,
    fontFamily: input.fontFamily ?? DEFAULT_FONT_FAMILY,
    textAlign: input.textAlign ?? 'left',
    rotation: input.rotation ?? 0,
    strokeColor: input.strokeColor ?? '#1e293b',
    fillColor: null,
    strokeWidth: 1, // text uses fontSize, not strokeWidth, but kept for BaseShape
    seed: input.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
}

let measureCtx: OffscreenCanvasRenderingContext2D | null = null;

function getMeasureContext(): OffscreenCanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not acquire a 2D context for text measurement');
    }
    measureCtx = ctx;
  }
  return measureCtx;
}

/**
 * Measures actual text bounds via ctx.measureText, using the same font
 * string and line-height formula as the renderer (utils/rough.ts drawText),
 * so selection outlines / resize handles hug the rendered glyphs instead of
 * a per-character guess.
 */
export function textBoundsEstimate(s: TextShape): Rect {
  const ctx = getMeasureContext();
  ctx.font = `${s.fontSize}px ${s.fontFamily}`;

  const lines = s.text.split('\n');
  let width = 0;
  for (const line of lines) {
    const lineWidth = ctx.measureText(line).width;
    if (lineWidth > width) width = lineWidth;
  }
  const height = lines.length * s.fontSize * 1.2;

  return { x: s.x, y: s.y, width, height };
}
