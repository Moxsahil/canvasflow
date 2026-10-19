import { describe, expect, it } from 'vitest';
import { fitCamera, panBy, toWorld, zoomAt, zoomStep } from './view-camera';

describe('the embed camera', () => {
  it('fits a big board inside the frame, centred', () => {
    const camera = fitCamera({ x: 0, y: 0, width: 2000, height: 1000 }, 800, 500);
    expect(camera.zoom).toBeLessThan(1);
    const centre = toWorld(camera, { x: 400, y: 250 });
    expect(centre.x).toBeCloseTo(1000);
    expect(centre.y).toBeCloseTo(500);
  });

  it('never blows a small board up past 100%', () => {
    expect(fitCamera({ x: 0, y: 0, width: 100, height: 50 }, 800, 500).zoom).toBe(1);
  });

  it('keeps the point under the pointer where it is while zooming', () => {
    const camera = { x: 10, y: 20, zoom: 1 };
    const before = toWorld(camera, { x: 300, y: 200 });
    const after = toWorld(zoomAt(camera, { x: 300, y: 200 }, 2), { x: 300, y: 200 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('stays within the editor’s zoom limits', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 100).zoom).toBe(5);
    expect(zoomStep({ x: 0, y: 0, zoom: 0.1 }, -1, 800, 500).zoom).toBe(0.1);
  });

  it('moves the board with the drag', () => {
    expect(panBy({ x: 0, y: 0, zoom: 2 }, 20, -10)).toEqual({ x: -10, y: 5, zoom: 2 });
  });
});
