import { describe, it, expect } from 'vitest';
import { createRectangle, type Shape } from '@canvasflow/canvas-engine';
import { resizeShape, resizeSnapHandle } from './tool-machine';
import type { HandleIndex } from './tool-machine.types';

/** A 100×60 box with its top-left at (100, 100). */
const box = (): Shape => createRectangle({ id: 'box', x: 100, y: 100, width: 100, height: 60 });

const boxOf = (shape: Shape) => {
  const s = shape as Shape & { width: number; height: number };
  return { x: s.x, y: s.y, width: s.width, height: s.height };
};

const resize = (handle: HandleIndex, dx: number, dy: number) =>
  boxOf(resizeShape(box(), handle, dx, dy));

describe('resizeShape — the anchor edge', () => {
  it('moves the right edge and leaves the left one', () => {
    expect(resize(3, 40, 0)).toEqual({ x: 100, y: 100, width: 140, height: 60 });
  });

  it('moves the left edge and leaves the right one', () => {
    expect(resize(7, 40, 0)).toEqual({ x: 140, y: 100, width: 60, height: 60 });
  });

  it('moves one corner and pins the opposite one', () => {
    expect(resize(0, 20, 10)).toEqual({ x: 120, y: 110, width: 80, height: 50 });
  });
});

describe('resizeShape — dragging an edge past its anchor', () => {
  it('mirrors the box rather than shunting the anchor along', () => {
    // The right edge dragged 40 past the left one: the left edge stays where
    // it was and the box now stands to the left of it.
    expect(resize(3, -140, 0)).toEqual({ x: 60, y: 100, width: 40, height: 60 });
  });

  it('mirrors the other way too', () => {
    // The left edge dragged 40 past the right one.
    expect(resize(7, 140, 0)).toEqual({ x: 200, y: 100, width: 40, height: 60 });
  });

  it('mirrors vertically', () => {
    expect(resize(5, -100, -100)).toEqual({ x: 100, y: 60, width: 100, height: 40 });
  });

  it('mirrors both axes at once from a corner', () => {
    // Bottom-right dragged up and left past the top-left corner, which stays.
    expect(resize(4, -150, -100)).toEqual({ x: 50, y: 60, width: 50, height: 40 });
  });

  it('keeps a sliver on whichever side of the anchor the drag has reached', () => {
    // Collapsed onto the left edge, which does not move: the box holds its
    // minimum to the right of it going in, and to the left coming out.
    expect(resize(3, -100, 0)).toEqual({ x: 100, y: 100, width: 1, height: 60 });
    expect(resize(3, -100.5, 0)).toEqual({ x: 99, y: 100, width: 1, height: 60 });
  });

  it('keeps the far edge exactly where it started, however far the drag goes', () => {
    const far = resize(3, -1000, 0);
    expect(far.x + far.width).toBe(100);
  });
});

describe('resizeSnapHandle', () => {
  it('leaves the handle alone while the box is the right way round', () => {
    expect(resizeSnapHandle(box(), 3, 40, 0)).toBe(3);
  });

  it('reports the mirrored handle once the box has flipped', () => {
    // Holding the middle-right handle, the drag is now moving the left edge.
    expect(resizeSnapHandle(box(), 3, -140, 0)).toBe(7);
  });

  it('mirrors a corner on both axes', () => {
    expect(resizeSnapHandle(box(), 4, -150, -100)).toBe(0);
  });

  it('leaves shapes with no box to mirror alone', () => {
    const text = { kind: 'text', id: 't' } as unknown as Shape;
    expect(resizeSnapHandle(text, 3, -1000, 0)).toBe(3);
  });
});
