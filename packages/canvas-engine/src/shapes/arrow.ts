import type { ArrowShape } from './shape.js';
import type { Rect } from '../math.js';

/**
 * An arrow is a line with arrowhead markers at one or both ends.
 * Same point-relative geometry as Line.
 */
export function createArrow(input: {
  id: string;
  x: number;
  y: number;
  points: ReadonlyArray<readonly [number, number]>;
  startArrowhead?: 'none' | 'triangle';
  endArrowhead?: 'none' | 'triangle';
  strokeColor?: string;
  strokeWidth?: number;
  rotation?: number;
  seed?: number;
}): ArrowShape {
  if (input.points.length < 2) {
    throw new Error('Arrow requires at least 2 points');
  }
  return {
    kind: 'arrow',
    id: input.id,
    x: input.x,
    y: input.y,
    points: input.points,
    startArrowhead: input.startArrowhead ?? 'none',
    endArrowhead: input.endArrowhead ?? 'triangle',
    rotation: input.rotation ?? 0,
    strokeColor: input.strokeColor ?? '#1e293b',
    fillColor: null,
    strokeWidth: input.strokeWidth ?? 2,
    seed: input.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
}

export function arrowBounds(s: ArrowShape): Rect {
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
