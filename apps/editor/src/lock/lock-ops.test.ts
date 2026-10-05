import { describe, expect, it } from 'vitest';
import {
  createArrow,
  createFrame,
  createRectangle,
  lockedShapeIds,
  type Shape,
} from '@canvasflow/canvas-engine';
import { joinableFrames, lockToggleFor, unlockAllUpdates, withoutLocked } from './lock-ops';
import { padlockPlacement } from './LockPadlock';

const box = (id: string, extra: Partial<Shape> = {}): Shape =>
  ({ ...createRectangle({ id, x: 0, y: 0, width: 10, height: 10 }), ...extra }) as Shape;
const frame = (id: string, extra: Partial<Shape> = {}): Shape =>
  ({ ...createFrame({ id, x: -50, y: -50, width: 200, height: 200 }), ...extra }) as Shape;
const arrowFrom = (id: string, from: string): Shape =>
  createArrow({
    id,
    x: 0,
    y: 0,
    points: [
      [0, 0],
      [100, 0],
    ],
    startBinding: { shapeId: from, anchor: { x: 0.5, y: 0.5 }, precise: false },
  });

const toggle = (selected: string[], shapes: Shape[]) =>
  lockToggleFor(selected, shapes, lockedShapeIds(shapes));

describe('lockToggleFor', () => {
  it('locks a selection with anything unlocked in it, leaving what is locked already', () => {
    const shapes = [box('a'), box('b', { locked: true })];
    expect(toggle(['a', 'b'], shapes)).toEqual({
      unlocking: false,
      updates: [{ id: 'a', patch: { locked: true } }],
    });
  });

  it('unlocks a selection that is all locked', () => {
    const shapes = [box('a', { locked: true }), box('b', { locked: true })];
    expect(toggle(['a', 'b'], shapes)).toEqual({
      unlocking: true,
      updates: [
        { id: 'a', patch: { locked: false } },
        { id: 'b', patch: { locked: false } },
      ],
    });
  });

  it('frees a member of a locked frame by unlocking the frame', () => {
    const shapes = [frame('f', { locked: true }), box('member', { frameId: 'f' })];
    expect(toggle(['member'], shapes).updates).toEqual([{ id: 'f', patch: { locked: false } }]);
  });

  it('frees an arrow by unlocking the shape it is locked with', () => {
    const shapes = [box('a', { locked: true }), arrowFrom('arrow', 'a')];
    expect(toggle(['arrow'], shapes).updates).toEqual([{ id: 'a', patch: { locked: false } }]);
  });

  it('does nothing with nothing selected', () => {
    expect(toggle([], [box('a')]).updates).toEqual([]);
  });
});

describe('unlockAllUpdates', () => {
  it('takes off every own lock, which frees what they held', () => {
    const shapes = [
      frame('f', { locked: true }),
      box('member', { frameId: 'f' }),
      box('a', { locked: true }),
      box('free'),
    ];
    expect(unlockAllUpdates(shapes)).toEqual([
      { id: 'f', patch: { locked: false } },
      { id: 'a', patch: { locked: false } },
    ]);
  });
});

describe('joinableFrames', () => {
  it('leaves out locked frames, and frames inside them', () => {
    const shapes = [
      frame('locked', { locked: true }),
      frame('inside', { frameId: 'locked' }),
      frame('open'),
    ];
    expect(joinableFrames(shapes, lockedShapeIds(shapes)).map((f) => f.id)).toEqual(['open']);
  });

  it('leaves out hidden frames too', () => {
    const shapes = [frame('hidden', { hidden: true }), frame('open')];
    expect(joinableFrames(shapes, new Set()).map((f) => f.id)).toEqual(['open']);
  });
});

describe('withoutLocked', () => {
  it('hands back the same list when nothing is locked', () => {
    const shapes = [box('a')];
    expect(withoutLocked(shapes, new Set())).toBe(shapes);
    expect(withoutLocked(shapes, new Set(['a']))).toEqual([]);
  });
});

describe('padlockPlacement', () => {
  const board = { width: 1200, height: 800 };

  it('sits just above the top-left corner', () => {
    expect(padlockPlacement({ x: 300, y: 200, width: 100, height: 50 }, board)).toEqual({
      left: 300,
      top: 200 - 8 - 34,
    });
  });

  it('keeps inside the board when the corner is near an edge', () => {
    expect(padlockPlacement({ x: -40, y: 10, width: 100, height: 50 }, board)).toEqual({
      left: 8,
      top: 8,
    });
  });

  it('has nowhere to be for shapes off screen', () => {
    expect(padlockPlacement({ x: 2000, y: 200, width: 100, height: 50 }, board)).toBeNull();
  });
});
