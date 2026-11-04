import { describe, expect, it } from 'vitest';
import { createRectangle } from '@canvasflow/canvas-engine';
import { hitTestHandles, hitTestRotateHandle, resizeCursorFor } from './handles';

// Box 0..200 × 0..100; at zoom 1 the selection box sits 4px outside it.
const rect = createRectangle({ id: 'r', x: 0, y: 0, width: 200, height: 100, seed: 1 });

describe('hitTestHandles', () => {
  it('takes the corners and middle dots as before', () => {
    expect(hitTestHandles(rect, -4, -4, 1)).toBe(0);
    expect(hitTestHandles(rect, 100, -4, 1)).toBe(1);
    expect(hitTestHandles(rect, 204, 104, 1)).toBe(4);
  });

  it('resizes from anywhere along an edge, not only its middle', () => {
    expect(hitTestHandles(rect, 40, -4, 1)).toBe(1);
    expect(hitTestHandles(rect, 204, 20, 1)).toBe(3);
    expect(hitTestHandles(rect, 160, 104, 1)).toBe(5);
    expect(hitTestHandles(rect, -4, 80, 1)).toBe(7);
  });

  it('reaches in over the shape’s own outline', () => {
    expect(hitTestHandles(rect, 1, 40, 1)).toBe(7);
  });

  it('leaves the middle to move the shape by', () => {
    expect(hitTestHandles(rect, 100, 50, 1)).toBeNull();
    expect(hitTestHandles(rect, 20, 20, 1)).toBeNull();
    expect(hitTestHandles(rect, 100, -30, 1)).toBeNull();
  });

  it('keeps a small shape movable in the middle', () => {
    const small = createRectangle({ id: 's', x: 0, y: 0, width: 12, height: 12, seed: 1 });
    expect(hitTestHandles(small, 6, 6, 1)).toBeNull();
  });
});

describe('resizeCursorFor', () => {
  it('points each handle the way it resizes', () => {
    expect(resizeCursorFor(0)).toBe('nwse-resize');
    expect(resizeCursorFor(2)).toBe('nesw-resize');
    expect(resizeCursorFor(5)).toBe('ns-resize');
    expect(resizeCursorFor(7)).toBe('ew-resize');
  });
});

describe('a turned shape', () => {
  // The same box, a quarter turn clockwise about (100, 50): its right edge now
  // faces down, along y = 154 with the selection pad.
  const turned = createRectangle({
    id: 't',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: Math.PI / 2,
    seed: 1,
  });

  it('finds its handles where they were turned to', () => {
    expect(hitTestHandles(turned, 100, 154, 1)).toBe(3);
    expect(hitTestHandles(turned, 204, 50, 1)).toBeNull();
  });

  it('turns the resize arrows with it', () => {
    expect(resizeCursorFor(3, turned)).toBe('ns-resize');
    expect(resizeCursorFor(4, turned)).toBe('nesw-resize');
    expect(resizeCursorFor(4, { ...turned, rotation: Math.PI / 4 })).toBe('ns-resize');
  });

  it('is turned by the dot above its top, wherever that top has gone', () => {
    // Its top now faces right: the dot stands 24px out from the right of its
    // turned box, level with its middle.
    expect(hitTestRotateHandle(turned, 174, 50, 1)).toBe(true);
    expect(hitTestRotateHandle(turned, 100, -74, 1)).toBe(false);
  });
});
