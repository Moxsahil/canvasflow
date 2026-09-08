import { describe, expect, it } from 'vitest';
import { GRID_SIZE, gridLevels } from './grid';

const at = (x: number, y: number, zoom: number) => gridLevels({ x, y, zoom });

/** The dot's absolute screen position on the axis, for the first few tiles. */
function dotsAcross(offset: number, spacing: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => offset + index * spacing);
}

describe('gridLevels', () => {
  it('returns the levels coarsest first, so the faint ones paint over the solid', () => {
    const steps = at(0, 0, 1).map((level) => level.step);
    expect(steps).toEqual([...steps].sort((a, b) => b - a));
  });

  it('spaces each level by its step in world units, scaled by the zoom', () => {
    for (const level of at(0, 0, 2)) {
      expect(level.spacing).toBe(level.step * GRID_SIZE * 2);
    }
  });

  it('drops the levels this zoom has faded out entirely', () => {
    // The finest grid only begins to appear at 0.7; below that it would be
    // dots a fraction of a pixel apart, drawn at a negative opacity.
    expect(at(0, 0, 0.5).map((level) => level.step)).not.toContain(1);
    expect(at(0, 0, 1).map((level) => level.step)).toContain(1);
  });

  it('fades a level in over its own zoom range and holds it there', () => {
    const finest = (zoom: number) => at(0, 0, zoom).find((level) => level.step === 1);

    // Halfway between 0.7 and 2.5.
    expect(finest(1.6)?.opacity).toBeCloseTo(0.5);
    expect(finest(2.5)?.opacity).toBe(1);
    expect(finest(8)?.opacity).toBe(1);
  });

  it('lands a dot on the world origin', () => {
    // Half a pixel off, which is what keeps the dot inside one device pixel
    // rather than straddling two.
    for (const level of at(0, 0, 1)) {
      expect(level.offsetX).toBeCloseTo(0.5);
      expect(level.offsetY).toBeCloseTo(0.5);
    }
  });

  it('keeps the dots on the same world points as the camera pans', () => {
    const zoom = 1;
    const [coarsest] = at(0, 0, zoom);
    const panned = at(37, -84, zoom)[0]!;

    // A dot sits on the same world point either way, so the panned grid's dots
    // are the unpanned ones shifted by exactly the pan.
    const before = dotsAcross(coarsest!.offsetX, coarsest!.spacing, 8);
    const after = dotsAcross(panned.offsetX, panned.spacing, 8);
    expect(after.some((dot) => before.some((other) => Math.abs(other - 37 - dot) < 1e-6))).toBe(
      true,
    );
  });

  it('keeps the dot inside its tile when the camera is past the world origin', () => {
    // A raw remainder keeps the sign of the dividend here, which would put the
    // dot outside the tile and leave a seam down the board.
    for (const camera of [
      { x: -500, y: -500 },
      { x: 500, y: 500 },
      { x: -13.7, y: 921.3 },
    ]) {
      for (const level of at(camera.x, camera.y, 1)) {
        expect(level.offsetX).toBeGreaterThanOrEqual(0);
        expect(level.offsetX).toBeLessThan(level.spacing);
        expect(level.offsetY).toBeGreaterThanOrEqual(0);
        expect(level.offsetY).toBeLessThan(level.spacing);
      }
    }
  });

  it('always leaves at least one level to draw, across the whole zoom range', () => {
    for (const zoom of [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 10, 30]) {
      expect(at(0, 0, zoom).length).toBeGreaterThan(0);
    }
  });

  it('never returns a spacing so fine the dots would merge into a wash', () => {
    for (const zoom of [0.05, 0.1, 0.5, 1, 5, 20]) {
      for (const level of at(0, 0, zoom)) {
        expect(level.spacing).toBeGreaterThan(2);
      }
    }
  });

  it('draws nothing for a camera that has no usable zoom', () => {
    expect(at(0, 0, 0)).toEqual([]);
    expect(at(0, 0, -1)).toEqual([]);
    expect(at(0, 0, Number.NaN)).toEqual([]);
    expect(at(Number.POSITIVE_INFINITY, 0, 1)).toEqual([]);
  });
});
