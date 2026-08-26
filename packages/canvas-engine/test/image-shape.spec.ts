import * as Y from 'yjs';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape.js';
import { shapeBounds } from '../src/shapes/bounds.js';
import { shapeContainsPoint, shapeHasSolidInterior } from '../src/shapes/outline.js';
import { createImage, fitPlacedImageSize, MAX_PLACED_IMAGE_EXTENT } from '../src/shapes/image.js';
import type { ImageShape } from '../src/shapes/shape.js';
import { DARK_EXPORT_FILTER, DARK_IMAGE_COMPENSATION_FILTER } from '../src/theme-filter.js';

function integrate(map: Y.Map<unknown>): Y.Map<unknown> {
  const doc = new Y.Doc();
  doc.getArray<Y.Map<unknown>>('shapes').push([map]);
  return doc.getArray<Y.Map<unknown>>('shapes').get(0);
}

function anImage(overrides: Partial<Parameters<typeof createImage>[0]> = {}): ImageShape {
  return createImage({
    id: 'i1',
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    fileId: 'a'.repeat(64),
    mimeType: 'image/png',
    naturalWidth: 400,
    naturalHeight: 200,
    ...overrides,
  });
}

describe('image shape', () => {
  it('round-trips through Yjs', () => {
    const original = anImage({ status: 'saved' });
    const shape = yMapToShape(integrate(shapeToYMap(original))) as ImageShape;

    expect(shape.kind).toBe('image');
    expect(shape.fileId).toBe('a'.repeat(64));
    expect(shape.mimeType).toBe('image/png');
    expect(shape.status).toBe('saved');
    expect(shape.naturalWidth).toBe(400);
    expect(shape.naturalHeight).toBe(200);
    expect(shape.width).toBe(100);
    expect(shape.height).toBe(50);
  });

  it('carries no image bytes into the document', () => {
    const map = integrate(shapeToYMap(anImage()));
    for (const value of map.values()) {
      expect(value instanceof Uint8Array).toBe(false);
      // The only long string a shape may hold is the 64-character hash.
      if (typeof value === 'string') expect(value.length).toBeLessThanOrEqual(64);
    }
  });

  it('drops a shape with no file id rather than showing a box that can never load', () => {
    const map = shapeToYMap(anImage());
    map.set('fileId', '');
    expect(yMapToShape(integrate(map))).toBeNull();
  });

  it('reads an unrecognised status as pending, so the bytes are still fetched', () => {
    const map = shapeToYMap(anImage());
    map.set('status', 'uploading-v2');
    expect((yMapToShape(integrate(map)) as ImageShape).status).toBe('pending');
  });

  it('falls back to the placed size when natural dimensions are absent', () => {
    const map = shapeToYMap(anImage());
    map.delete('naturalWidth');
    map.delete('naturalHeight');

    const shape = yMapToShape(integrate(map)) as ImageShape;
    expect(shape.naturalWidth).toBe(100);
    expect(shape.naturalHeight).toBe(50);
  });

  it('bounds and hit-testing follow the placed box', () => {
    const shape = anImage();
    expect(shapeBounds(shape)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(shapeContainsPoint(shape, 60, 45)).toBe(true);
    expect(shapeContainsPoint(shape, 5, 45)).toBe(false);
    // Solid, so the eraser catches a photo by its middle and not only its edge.
    expect(shapeHasSolidInterior(shape)).toBe(true);
  });
});

describe('fitPlacedImageSize', () => {
  it('fits a large image inside the placement box, keeping its ratio', () => {
    const { width, height } = fitPlacedImageSize(4000, 2000);
    expect(width).toBe(MAX_PLACED_IMAGE_EXTENT);
    expect(height).toBe(MAX_PLACED_IMAGE_EXTENT / 2);
  });

  it('never enlarges a small image', () => {
    expect(fitPlacedImageSize(64, 32)).toEqual({ width: 64, height: 32 });
  });

  it('survives a zero-sized source', () => {
    const { width, height } = fitPlacedImageSize(0, 0);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});

describe('dark mode compensation', () => {
  /** Apply `invert(amount)` to one channel, as the filter spec defines it. */
  const invert = (c: number, amount: number) => c * (1 - 2 * amount) + amount;
  /** Apply `contrast(amount)`, likewise. */
  const contrast = (c: number, amount: number) => amount * c + 0.5 - 0.5 * amount;

  it('cancels the board filter out, so a photo survives it unchanged', () => {
    const boardInvert = Number(/invert\(([\d.]+)%\)/.exec(DARK_EXPORT_FILTER)![1]) / 100;
    const compContrast =
      Number(/contrast\(([\d.]+)%\)/.exec(DARK_IMAGE_COMPENSATION_FILTER)![1]) / 100;

    for (const original of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      // What the renderer paints: full inversion, then the contrast stretch.
      // Hue rotation is its own inverse at 180° and leaves greys alone, so it
      // drops out of a per-channel check.
      const painted = contrast(invert(original, 1), compContrast);
      // What the board filter then does to those pixels.
      const onScreen = invert(painted, boardInvert);

      expect(onScreen).toBeCloseTo(original, 5);
    }
  });
});
