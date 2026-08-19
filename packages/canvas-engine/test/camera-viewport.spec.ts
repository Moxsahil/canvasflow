import { describe, expect, it } from 'vitest';
import { fitRectToViewport, rectIntersectsViewport } from '../src/document/camera';

const viewport = { width: 1000, height: 800 };
const origin = { x: 0, y: 0, zoom: 1 };

describe('rectIntersectsViewport', () => {
  it('sees content sitting under the camera', () => {
    expect(
      rectIntersectsViewport({ x: 100, y: 100, width: 50, height: 50 }, origin, viewport),
    ).toBe(true);
  });

  it('does not see content far from the origin', () => {
    // The case behind the blank-canvas report: an opened drawing's own
    // coordinates, viewed from a camera that has just been reset by a reload.
    expect(
      rectIntersectsViewport({ x: 4000, y: 3000, width: 500, height: 400 }, origin, viewport),
    ).toBe(false);
  });

  it('counts content that only partly overlaps', () => {
    expect(
      rectIntersectsViewport({ x: -20, y: -20, width: 50, height: 50 }, origin, viewport),
    ).toBe(true);
  });

  it('accounts for zoom', () => {
    const rect = { x: 900, y: 700, width: 50, height: 50 };
    expect(rectIntersectsViewport(rect, origin, viewport)).toBe(true);
    // Zoomed in, the same world rect lands past the edge of the screen.
    expect(rectIntersectsViewport(rect, { x: 0, y: 0, zoom: 4 }, viewport)).toBe(false);
  });

  it('agrees that a fitted camera puts the content on screen', () => {
    const rect = { x: 4000, y: 3000, width: 500, height: 400 };
    const fitted = fitRectToViewport(rect, viewport);
    expect(rectIntersectsViewport(rect, fitted, viewport)).toBe(true);
  });
});
