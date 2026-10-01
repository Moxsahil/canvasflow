import * as Y from 'yjs';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape.js';
import { shapeBounds } from '../src/shapes/bounds.js';
import { shapeContainsPoint, shapeHasSolidInterior } from '../src/shapes/outline.js';
import { createImage, fitPlacedImageSize, MAX_PLACED_IMAGE_EXTENT } from '../src/shapes/image.js';
import type { ImageShape } from '../src/shapes/shape.js';

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
  it('leaves legacy images unflipped without adding persisted keys', () => {
    const original = anImage();
    const map = integrate(shapeToYMap(original));
    const read = yMapToShape(map) as ImageShape;

    expect(original.flipX).toBeUndefined();
    expect(original.flipY).toBeUndefined();
    expect(map.has('flipX')).toBe(false);
    expect(map.has('flipY')).toBe(false);
    expect(read.flipX).toBeUndefined();
    expect(read.flipY).toBeUndefined();
  });

  it.each([
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ])('round-trips flipX=%s and flipY=%s without changing image identity', (flipX, flipY) => {
    const original = anImage({ status: 'saved', flipX, flipY });
    const read = yMapToShape(integrate(shapeToYMap(original))) as ImageShape;

    expect(read).toEqual(original);
    expect(shapeBounds(read)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(shapeContainsPoint(read, 60, 45)).toBe(true);
  });

  it('persists explicit false when an image is flipped back', () => {
    const map = integrate(shapeToYMap(anImage({ flipX: true, flipY: true })));
    const unflipped = integrate(shapeToYMap(anImage({ flipX: false, flipY: false })));
    for (const [key, value] of unflipped) map.set(key, value);

    expect(map.get('flipX')).toBe(false);
    expect(map.get('flipY')).toBe(false);
    expect(yMapToShape(map)).toMatchObject({ flipX: false, flipY: false });
  });

  it.each(['true', 'false', 1, 0, null, {}, []])(
    'does not interpret malformed flip flags as enabled: %j',
    (value) => {
      const map = shapeToYMap(anImage());
      map.set('flipX', value);
      map.set('flipY', value);
      const read = yMapToShape(integrate(map)) as ImageShape;

      expect(read.flipX).toBeUndefined();
      expect(read.flipY).toBeUndefined();
    },
  );

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
