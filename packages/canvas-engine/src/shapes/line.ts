import type { LineShape } from './shape.js';
import type { Rect } from '../math.js';

/**
 * A line is defined by 2+ points. The first point is the line's origin
 * (x, y); subsequent points are relative to it in the canvas coordinate
 * system. Multi-point lines become poly-lines (multiple connected segments).
 */
export function createLine(input: {
  id: string;
  x: number;
  y: number;
  points: ReadonlyArray<readonly [number, number]>;
  strokeColor?: string;
  strokeWidth?: number;
  rotation?: number;
  seed?: number;
}): LineShape {
  if (input.points.length < 2) {
    throw new Error('Line requires at least 2 points');
  }
  return {
    kind: 'line',
    id: input.id,
    x: input.x,
    y: input.y,
    points: input.points,
    rotation: input.rotation ?? 0,
    strokeColor: input.strokeColor ?? '#1e293b',
    fillColor: null,
    strokeWidth: input.strokeWidth ?? 2,
    seed: input.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
}

/** Axis-aligned bounding box that contains all the line's points. */
export function lineBounds(s: LineShape): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of s.points) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  return {
    x: s.x + minX,
    y: s.y + minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
