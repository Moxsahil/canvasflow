import type { Rect } from '../math.js';
import type { EllipseShape } from './shape.js';
import { resolveBaseStyle, type BaseStyleInput } from './style.js';

export function createEllipse(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  },
): EllipseShape {
  return {
    kind: 'ellipse',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    ...resolveBaseStyle(input),
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
