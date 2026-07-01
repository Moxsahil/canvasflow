import type { Rect } from '../math.js';
import type { EllipseShape } from './shape.js';

export function createEllipse(input: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  fillColor?: string | null;
  strokeWidth?: number;
  rotation?: number;
  seed?: number;
}): EllipseShape {
  return {
    kind: 'ellipse',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation ?? 0,
    strokeColor: input.strokeColor ?? '#1e293b',
    fillColor: input.fillColor ?? null,
    strokeWidth: input.strokeWidth ?? 2,
    seed: input.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
}

export function ellipseBounds(s: EllipseShape): Rect {
  return {
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
  };
}
