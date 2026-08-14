import type { Rect } from '../math';
import type { RectangleShape } from './shape';
import { resolveBaseStyle, type BaseStyleInput, type Edges } from './style.js';

export function createRectangle(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    edges?: Edges;
  },
): RectangleShape {
  return {
    kind: 'rectangle',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    edges: input.edges ?? 'sharp',
    ...resolveBaseStyle(input),
  };
}

/** The axis-aligned bounding box of a rectangle (ignoring rotation for now). */
export function rectangleBounds(s: RectangleShape): Rect {
  return {
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
  };
}
