import { isPathALoop, simplifyPoints } from '../src/utils/simplify.js';

type Point = readonly [number, number];

describe('simplifyPoints', () => {
  it('keeps the endpoints', () => {
    const points: Point[] = [
      [0, 0],
      [1, 0.1],
      [2, -0.1],
      [10, 0],
    ];
    const result = simplifyPoints(points);

    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([10, 0]);
  });

  it('drops points that sit on the line within tolerance', () => {
    // A straight run collapses to just its two ends.
    const points: Point[] = Array.from({ length: 50 }, (_, i) => [i, 0] as Point);

    expect(simplifyPoints(points)).toHaveLength(2);
  });

  it('keeps points that deviate beyond tolerance', () => {
    const points: Point[] = [
      [0, 0],
      [5, 40],
      [10, 0],
    ];

    expect(simplifyPoints(points)).toHaveLength(3);
  });

  it('passes through short inputs untouched', () => {
    expect(simplifyPoints([[0, 0]])).toHaveLength(1);
    expect(
      simplifyPoints([
        [0, 0],
        [1, 1],
      ]),
    ).toHaveLength(2);
  });
});

describe('isPathALoop', () => {
  it('is true when the stroke returns near its start', () => {
    const points: Point[] = [
      [0, 0],
      [30, 5],
      [28, 30],
      [3, 4],
    ];

    expect(isPathALoop(points)).toBe(true);
  });

  it('is false for an open stroke', () => {
    const points: Point[] = [
      [0, 0],
      [50, 5],
      [100, 30],
    ];

    expect(isPathALoop(points)).toBe(false);
  });

  it('is false with fewer than three points', () => {
    expect(
      isPathALoop([
        [0, 0],
        [0, 0],
      ]),
    ).toBe(false);
  });
});
