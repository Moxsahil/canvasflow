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

/**
 * Bounds for text are approximate without measuring the actual font.
 * Returns a rough estimate using fontSize × text length.
 * Real measurement (using ctx.measureText) happens at render time.
 */
export function textBoundsEstimate(s: TextShape): Rect {
  // Rough estimate: width = chars × (fontSize × 0.6), height = fontSize × 1.2
  const lines = s.text.split('\n');
  const longestLine = Math.max(...lines.map((l) => l.length));
  const width = longestLine * s.fontSize * 0.6;
  const height = lines.length * s.fontSize * 1.2;
  return { x: s.x, y: s.y, width, height };
}
