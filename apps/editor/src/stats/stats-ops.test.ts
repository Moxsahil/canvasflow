import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createFrame,
  createImage,
  createLine,
  createRectangle,
  createText,
  type Shape,
} from '@canvasflow/canvas-engine';
import {
  MIXED,
  applyStatsEdit,
  boardSize,
  isStatsEditable,
  membershipAfterStatsEdit,
  statsValue,
  type StatsEdit,
  type StatsGeometry,
} from './stats-ops';

// Text is measured on a canvas, and this suite runs without one. Half the font
// size a character is as good a ruler as any for checking the arithmetic.
beforeAll(() => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return {
          font: '',
          measureText(text: string) {
            return { width: text.length * (Number.parseFloat(this.font) / 2) };
          },
        };
      }
    },
  );
});

function rect(id: string, x: number, y: number, width = 100, height = 50, frameId?: string): Shape {
  const shape = createRectangle({ id, x, y, width, height });
  return frameId ? { ...shape, frameId } : shape;
}

function frame(id: string, x: number, y: number, width = 400, height = 300): Shape {
  return createFrame({ id, x, y, width, height });
}

const line = (id: string): Shape =>
  createLine({
    id,
    x: 10,
    y: 20,
    points: [
      [0, 0],
      [60, 40],
    ],
  });

const text = (id: string, textAlign: 'left' | 'center' | 'right' = 'left'): Shape =>
  createText({ id, x: 100, y: 100, text: 'abcdefghij', fontSize: 20, textAlign });

const set = (value: number): StatsEdit => ({ kind: 'set', value });
const scrub = (change: number, byStep = false): StatsEdit => ({ kind: 'scrub', change, byStep });

/** The patches an edit makes, by shape id. */
function edited(
  property: Parameters<typeof applyStatsEdit>[0],
  edit: StatsEdit,
  originals: readonly Shape[],
  board: readonly Shape[] = originals,
): Record<string, StatsGeometry> {
  return Object.fromEntries(
    applyStatsEdit(property, edit, originals, board).map(({ id, patch }) => [id, patch]),
  );
}

describe('statsValue', () => {
  it('reads a shape as the box around it', () => {
    const shape = rect('a', 12.345, 7, 100, 50);

    expect(statsValue([shape], 'x')).toBe(12.35);
    expect(statsValue([shape], 'y')).toBe(7);
    expect(statsValue([shape], 'width')).toBe(100);
    expect(statsValue([shape], 'height')).toBe(50);
  });

  it('reads a line from its points, which is the only size it has', () => {
    expect(statsValue([line('l')], 'width')).toBe(60);
    expect(statsValue([line('l')], 'height')).toBe(40);
  });

  it('shows the value shapes share, and says so where they differ', () => {
    const shapes = [rect('a', 0, 10), rect('b', 0, 90)];

    expect(statsValue(shapes, 'x')).toBe(0);
    expect(statsValue(shapes, 'y')).toBe(MIXED);
  });

  it('has a font size for text and for nothing else', () => {
    expect(statsValue([text('t')], 'fontSize')).toBe(20);
    expect(statsValue([rect('a', 0, 0)], 'fontSize')).toBeNull();
    // Among other shapes, the text's is the one shown.
    expect(statsValue([rect('a', 0, 0), text('t')], 'fontSize')).toBe(20);
  });
});

describe('isStatsEditable', () => {
  it('lets anything be moved', () => {
    for (const shape of [rect('a', 0, 0), line('l'), text('t'), frame('f', 0, 0)]) {
      expect(isStatsEditable(shape, 'x')).toBe(true);
      expect(isStatsEditable(shape, 'y')).toBe(true);
    }
  });

  it('leaves the size of a line alone, since it has no box to stretch', () => {
    expect(isStatsEditable(line('l'), 'width')).toBe(false);
    expect(isStatsEditable(line('l'), 'height')).toBe(false);
    expect(isStatsEditable(rect('a', 0, 0), 'width')).toBe(true);
  });
});

describe('boardSize', () => {
  it('measures everything on the board together', () => {
    expect(boardSize([rect('a', 0, 0, 100, 50), rect('b', 300, 200, 100, 50)])).toEqual({
      width: 400,
      height: 250,
    });
  });

  it('is nothing for an empty board', () => {
    expect(boardSize([])).toEqual({ width: 0, height: 0 });
  });
});

describe('applyStatsEdit — position', () => {
  it('puts a shape where the number typed says', () => {
    expect(edited('x', set(250.5), [rect('a', 10, 20)])).toEqual({ a: { x: 250.5 } });
    expect(edited('y', set(-40), [rect('a', 10, 20)])).toEqual({ a: { y: -40 } });
  });

  it('writes nothing for a number that is already true', () => {
    expect(edited('x', set(10), [rect('a', 10, 20)])).toEqual({});
  });

  it('moves a line by its box, keeping its points', () => {
    // The box starts at the line's own origin here; typed 100, the origin goes there.
    expect(edited('x', set(100), [line('l')])).toEqual({ l: { x: 100 } });
  });

  it('follows a drag from where the shape started, on whole units', () => {
    const start = [rect('a', 10.4, 20)];

    expect(edited('x', scrub(5), start)).toEqual({ a: { x: 15 } });
    // Worked out from the start again, not from the step before.
    expect(edited('x', scrub(30), start)).toEqual({ a: { x: 40 } });
  });

  it('walks a single shape along tens with Shift held', () => {
    expect(edited('x', scrub(7, true), [rect('a', 12, 0)])).toEqual({ a: { x: 20 } });
    expect(edited('x', scrub(-19, true), [rect('a', 12, 0)])).toEqual({ a: { x: -10 } });
  });

  it('lines several shapes up on a typed number', () => {
    const shapes = [rect('a', 10, 0), rect('b', 300, 80)];

    expect(edited('x', set(50), shapes)).toEqual({ a: { x: 50 }, b: { x: 50 } });
  });

  it('drags several shapes together, keeping the space between them', () => {
    const shapes = [rect('a', 12, 0), rect('b', 300, 80)];

    expect(edited('x', scrub(14, true), shapes)).toEqual({ a: { x: 22 }, b: { x: 310 } });
  });

  it('takes a frame’s contents along, however deep', () => {
    const board = [
      frame('f', 0, 0),
      { ...frame('inner', 20, 20, 200, 100), frameId: 'f' },
      rect('leaf', 40, 40, 20, 20, 'inner'),
      rect('loose', 900, 900),
    ];

    expect(edited('x', set(100), [board[0]!], board)).toEqual({
      f: { x: 100 },
      inner: { x: 120 },
      leaf: { x: 140 },
    });
  });

  it('places a shape selected with its frame once, by its own edit', () => {
    const board = [frame('f', 0, 0), rect('a', 40, 40, 20, 20, 'f')];

    expect(edited('x', set(100), board, board)).toEqual({ f: { x: 100 }, a: { x: 100 } });
    expect(edited('x', scrub(10), board, board)).toEqual({ f: { x: 10 }, a: { x: 50 } });
  });
});

describe('applyStatsEdit — size', () => {
  it('sets one side of a box and leaves the other, and its corner, where they were', () => {
    expect(edited('width', set(240), [rect('a', 10, 20, 100, 50)])).toEqual({ a: { width: 240 } });
    expect(edited('height', scrub(-20), [rect('a', 10, 20, 100, 50)])).toEqual({
      a: { height: 30 },
    });
  });

  it('never makes a box smaller than the smallest a drag allows', () => {
    expect(edited('width', set(0), [rect('a', 0, 0, 100, 50)])).toEqual({ a: { width: 1 } });
    expect(edited('width', scrub(-500), [rect('a', 0, 0, 100, 50)])).toEqual({ a: { width: 1 } });
  });

  it('lands on tens with Shift held', () => {
    expect(edited('width', scrub(27, true), [rect('a', 0, 0, 100, 50)])).toEqual({
      a: { width: 130 },
    });
  });

  it('keeps a picture’s proportions', () => {
    const image = createImage({
      id: 'i',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      fileId: 'file',
      mimeType: 'image/png',
      naturalWidth: 400,
      naturalHeight: 200,
    });

    expect(edited('width', set(300), [image])).toEqual({ i: { width: 300, height: 150 } });
    expect(edited('height', set(40), [image])).toEqual({ i: { height: 40, width: 80 } });
  });

  it('leaves a line out, among shapes it can resize', () => {
    const shapes = [rect('a', 0, 0, 100, 50), line('l')];

    expect(edited('width', set(200), shapes)).toEqual({ a: { width: 200 } });
  });

  it('resizes text through its font, with the left edge held', () => {
    // Ten characters at 20 is 100 wide; asked for 200, the font doubles.
    expect(edited('width', set(200), [text('t')])).toEqual({ t: { fontSize: 40, x: 100 } });
    // Centred text keeps its `x` in the middle of what is drawn: 50 to 250
    // becomes 50 to 250 + 100, so the middle moves to 150.
    expect(edited('width', set(200), [text('t', 'center')])).toEqual({
      t: { fontSize: 40, x: 150 },
    });
  });

  it('stops text at the largest font there is', () => {
    expect(edited('width', set(100_000), [text('t')]).t).toMatchObject({ fontSize: 200 });
  });
});

describe('applyStatsEdit — font size', () => {
  it('sets a whole size, within the limits a font has', () => {
    expect(edited('fontSize', set(31.6), [text('t')])).toEqual({ t: { fontSize: 32 } });
    expect(edited('fontSize', set(2), [text('t')])).toEqual({ t: { fontSize: 8 } });
    expect(edited('fontSize', set(999), [text('t')])).toEqual({ t: { fontSize: 200 } });
  });

  it('steps in fours with Shift held', () => {
    expect(edited('fontSize', scrub(5, true), [text('t')])).toEqual({ t: { fontSize: 24 } });
  });

  it('changes the text in a selection and nothing else in it', () => {
    expect(edited('fontSize', set(40), [rect('a', 0, 0), text('t')])).toEqual({
      t: { fontSize: 40 },
    });
  });
});

describe('membershipAfterStatsEdit', () => {
  it('puts a shape moved into a frame in it, and takes it out again', () => {
    const board = [frame('f', 0, 0), rect('a', 50, 50, 20, 20), rect('b', 900, 900, 20, 20, 'f')];

    expect(membershipAfterStatsEdit('x', ['a', 'b'], board)).toEqual([
      { id: 'a', frameId: 'f' },
      { id: 'b', frameId: null },
    ]);
  });

  it('leaves the contents of a frame that was moved in it', () => {
    const board = [frame('f', 500, 0), rect('a', 550, 50, 20, 20, 'f')];

    expect(membershipAfterStatsEdit('x', ['f'], board)).toEqual([]);
  });

  it('asks a resized frame what its edges now hold', () => {
    // Wide enough now to swallow the loose shape; the member it no longer
    // touches is let go.
    const board = [
      frame('f', 0, 0, 400, 100),
      rect('inside', 300, 20, 20, 20),
      rect('outside', 20, 500, 20, 20, 'f'),
    ];

    expect(membershipAfterStatsEdit('width', ['f'], board)).toEqual([
      { id: 'inside', frameId: 'f' },
      { id: 'outside', frameId: null },
    ]);
  });
});
