import { describe, expect, it } from 'vitest';
import { cameraKeepingInView } from './keep-in-view';

const AREA = { left: 8, top: 60, right: 220, bottom: 600 };

describe('cameraKeepingInView', () => {
  it('leaves the camera alone when the shapes are already in the clear area', () => {
    const rect = { x: 50, y: 100, width: 100, height: 60 };
    expect(cameraKeepingInView(rect, { x: 0, y: 0, zoom: 1 }, AREA)).toBeNull();
  });

  it('centres shapes hidden behind a panel in the clear area', () => {
    const rect = { x: 300, y: 300, width: 100, height: 60 };
    const camera = cameraKeepingInView(rect, { x: 0, y: 0, zoom: 1 }, AREA)!;
    expect(camera.zoom).toBe(1);
    const left = (rect.x - camera.x) * camera.zoom;
    const top = (rect.y - camera.y) * camera.zoom;
    expect(left).toBeCloseTo(8 + (212 - 100) / 2);
    expect(top).toBeCloseTo(60 + (540 - 60) / 2);
  });

  it('zooms out, never in, when the shapes are too big for the area', () => {
    const rect = { x: 0, y: 0, width: 800, height: 200 };
    const camera = cameraKeepingInView(rect, { x: 0, y: 0, zoom: 1 }, AREA)!;
    expect(camera.zoom).toBeLessThan(1);
    expect(rect.width * camera.zoom).toBeLessThanOrEqual(212);
    const small = cameraKeepingInView(
      { x: 500, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, zoom: 1 },
      AREA,
    )!;
    expect(small.zoom).toBe(1);
  });

  it('gives up on an area with no room', () => {
    expect(
      cameraKeepingInView(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: 0, zoom: 1 },
        { left: 10, top: 10, right: 5, bottom: 5 },
      ),
    ).toBeNull();
  });
});
