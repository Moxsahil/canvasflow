import { describe, expect, it } from 'vitest';
import { createArrow } from '../src/shapes/arrow.js';
import type { Roughness } from '../src/shapes/style.js';
import { createRoughGenerator, generateArrowDrawable } from '../src/utils/rough.js';

const source = { generator: createRoughGenerator() };

/** Where each stroke of the drawn line begins and ends. */
function strokeEnds(roughness: Roughness, arrowType: 'straight' | 'elbow') {
  const arrow = createArrow({
    id: 'a',
    x: 10,
    y: 20,
    points: [
      [0, 0],
      [200, 80],
    ],
    arrowType,
    roughness,
    seed: 7,
  });
  const ops = generateArrowDrawable(source, arrow).sets.flatMap((set) => set.ops);
  const starts = ops.filter((op) => op.op === 'move').map((op) => op.data.slice(0, 2));
  const last = ops.at(-1)!.data;
  return { starts, end: last.slice(-2) };
}

describe("an arrow's line", () => {
  for (const roughness of [0, 1, 2] as const) {
    for (const arrowType of ['straight', 'elbow'] as const) {
      it(`starts and ends exactly on its points (${arrowType}, roughness ${roughness})`, () => {
        // Off by even a unit, the line pokes out past the head's tip, or stops
        // short of the shape a bound arrow is meant to meet.
        const { starts, end } = strokeEnds(roughness, arrowType);
        expect(starts[0]).toEqual([10, 20]);
        expect(end).toEqual([210, 100]);
      });
    }
  }
});
