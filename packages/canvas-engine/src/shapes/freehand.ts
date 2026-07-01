import type { FreehandShape } from './shape.js';
import type { Rect } from '../math.js';

/**
 * A freehand stroke is many short segments captured from pointer move
 * events. Unlike Line, freehand strokes are usually 50-500 points and
 * represent a single continuous gesture.
 */
export function createFreehand(input: {
  id: string;
  x: number;
  y: number;
  points: ReadonlyArray<readonly [number, number]>;
  strokeColor?: string;
  strokeWidth?: number;
  rotation?: number;
  seed?: number;
}): FreehandShape {
  return {
    kind: 'freehand',
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

export function freehandBounds(s: FreehandShape): Rect {
  if (s.points.length === 0) {
    return { x: s.x, y: s.y, width: 0, height: 0 };
  }
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
