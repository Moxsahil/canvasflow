import type { TextShape } from './shape.js';
import type { Rect } from '../math.js';
import { resolveBaseStyle, type BaseStyleInput } from './style.js';

export const DEFAULT_FONT_FAMILY = '"Caveat", "Comic Sans MS", system-ui, sans-serif';
export const DEFAULT_FONT_SIZE = 20;

export function createText(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    text: string;
    fontSize?: number;
    fontFamily?: string;
    textAlign?: 'left' | 'center' | 'right';
  },
): TextShape {
  return {
    kind: 'text',
    id: input.id,
    x: input.x,
    y: input.y,
    text: input.text,
    fontSize: input.fontSize ?? DEFAULT_FONT_SIZE,
    fontFamily: input.fontFamily ?? DEFAULT_FONT_FAMILY,
    textAlign: input.textAlign ?? 'left',
    ...resolveBaseStyle(input),
    fillColor: null,
    // Text is sized by fontSize; strokeWidth is carried only for BaseShape.
    strokeWidth: 1,
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

  // The renderer sets ctx.textAlign, so x is the anchor rather than always the
  // left edge. Shift the box to match, or selection outlines and hit-testing
  // would sit beside centred and right-aligned text.
  const x =
    s.textAlign === 'center' ? s.x - width / 2 : s.textAlign === 'right' ? s.x - width : s.x;

  return { x, y: s.y, width, height };
}
