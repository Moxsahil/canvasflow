import type { FreehandShape } from './shape.js';
import type { Rect } from '../math.js';
import { resolveBaseStyle, type BaseStyleInput, type Edges } from './style.js';

/**
 * A freehand stroke is many short segments captured from pointer move
 * events. Unlike Line, freehand strokes are usually 50-500 points and
 * represent a single continuous gesture.
 */
export function createFreehand(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    points: ReadonlyArray<readonly [number, number]>;
    edges?: Edges;
    simulatePressure?: boolean;
  },
): FreehandShape {
  return {
    kind: 'freehand',
    id: input.id,
    x: input.x,
    y: input.y,
    points: input.points,
    edges: input.edges ?? 'round',
    simulatePressure: input.simulatePressure ?? true,
    ...resolveBaseStyle(input),
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
