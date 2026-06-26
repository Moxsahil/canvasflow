import { createRectangle } from '../../src/shapes/rectangle.js';
import type { RectangleShape } from '../../src/shapes/shape.js';

export function makeTestRectangle(overrides?: Partial<RectangleShape>): RectangleShape {
  return {
    ...createRectangle({
      id: 'rect-1',
      x: 10,
      y: 10,
      width: 100,
      height: 50,
      strokeColor: '#1e293b',
      fillColor: null,
      strokeWidth: 2,
      seed: 42,
    }),
    ...overrides,
  };
}

export function makeTestRectangles(count: number): RectangleShape[] {
  const result: RectangleShape[] = [];

  for (let i = 0; i < count; i++) {
    result.push(
      makeTestRectangle({
        id: `rect-${1}`,
        x: 10 + i * 120,
        y: 10,
        seed: 100 + i,
      }),
    );
  }
  return result;
}
