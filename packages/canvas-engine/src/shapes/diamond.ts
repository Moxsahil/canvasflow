import type { Rect } from '../math.js';
import type { DiamondShape } from './shape.js';
import { resolveBaseStyle, type BaseStyleInput, type Edges } from './style.js';

/**
 * Diamond is just a 4-point polygon: top, right, bottom, left of its
 * bounding box. Width/height define the box.
 */

export function createDiamond(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    edges?: Edges;
  },
): DiamondShape {
  return {
    kind: 'diamond',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    edges: input.edges ?? 'sharp',
    ...resolveBaseStyle(input),
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
