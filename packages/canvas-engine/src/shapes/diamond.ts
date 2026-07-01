import type { Rect } from '../math.js';
import type { DiamondShape } from './shape.js';

/**
 * Diamond is just a 4-point polygon: top, right, bottom, left of its
 * bounding box. Width/height define the box.
 */

export function createDiamond(input: {
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
}): DiamondShape {
  return {
    kind: 'diamond',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation ?? 0,
    fillColor: input.fillColor ?? null,
    strokeColor: input.strokeColor ?? '#1e293b',
    strokeWidth: input.strokeWidth ?? 2,
    seed: input.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
}

export function diamondBounds(s: DiamondShape): Rect {
  return {
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
  };
}

/** The 4 corner points of the diamond, in clockwise order from top. */
export function diamondPoints(s: DiamondShape): ReadonlyArray<readonly [number, number]> {
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  return [
    [cx, s.y], // top
    [s.x + s.width, cy], // right
    [cx, s.y + s.height], // bottom
    [s.x, cy], // left
  ];
}
