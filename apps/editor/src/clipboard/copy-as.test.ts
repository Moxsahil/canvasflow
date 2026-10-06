import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createArrow,
  createFrame,
  createRectangle,
  createText,
  type Shape,
} from '@canvasflow/canvas-engine';
import { exportScopeFor } from '../file/export-image';
import { clipboardContentFrom } from './clipboard-ops';
import { copyDataFor, copyJsonOf, copySubjectFor, copyTextOf, hasWords } from './copy-as';

// Text is measured on a canvas, which this environment does not have: a
// stand-in that makes every character half as wide as the font is tall.
const realOffscreenCanvas = globalThis.OffscreenCanvas;
beforeAll(() => {
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        font: '10px sans-serif',
        measureText(this: { font: string }, text: string) {
          return { width: text.length * parseFloat(this.font) * 0.5 };
        },
      };
    }
  } as never;
});
afterAll(() => {
  globalThis.OffscreenCanvas = realOffscreenCanvas;
});

function box(id: string, x: number, y: number, frameId?: string): Shape {
  const shape = createRectangle({ id, x, y, width: 100, height: 40 });
  return frameId ? { ...shape, frameId } : shape;
}

function text(id: string, x: number, y: number, words: string): Shape {
  return createText({ id, x, y, text: words });
}

function frame(id: string, x: number, y: number): Shape {
  return createFrame({ id, x, y, width: 400, height: 300, name: 'Checkout' });
}

const ids = (shapes: readonly Shape[]) => shapes.map((shape) => shape.id);

describe('what Copy as covers', () => {
  const inFrame = box('inside', 20, 20, 'f');
  const loose = box('loose', 600, 0);
  const board = [frame('f', 0, 0), inFrame, loose];

  it('copies the board when nothing is selected', () => {
    expect(copySubjectFor([])).toBe('board');
    expect(ids(copyDataFor(board, []))).toEqual(['f', 'inside', 'loose']);
    expect(ids(exportScopeFor(board, []).shapes)).toEqual(['f', 'inside', 'loose']);
  });

  it('takes a frame with everything standing in it', () => {
    const [f] = board;
    expect(copySubjectFor([f!, loose])).toBe('selection');
    expect(ids(copyDataFor(board, [f!, loose]))).toEqual(['f', 'inside', 'loose']);
  });

  it('draws a frame selected on its own as its contents, cut to its edge', () => {
    const [f] = board;
    expect(copySubjectFor([f!])).toBe('frame');

    const scope = exportScopeFor(board, [f!]);
    expect(ids(scope.shapes)).toEqual(['inside']);
    expect(scope.region).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    // The data keeps the frame itself: its name and its record are part of it.
    expect(ids(copyDataFor(board, [f!]))).toEqual(['f', 'inside']);
  });

  it('leaves out a shape the board does not show', () => {
    // `shapes` is what is showing; a member missing from it stays missing.
    const [f] = board;
    expect(ids(copyDataFor([f!, loose], [f!]))).toEqual(['f']);
  });
});

describe('copyTextOf', () => {
  it('reads top to bottom, and across a row that is not quite level', () => {
    const shapes = [
      text('last', 0, 300, 'Footer'),
      text('right', 300, 108, 'Right'),
      text('left', 0, 100, 'Left'),
      text('first', 0, 0, 'Heading'),
    ];

    expect(copyTextOf(shapes)).toBe('Heading\n\nLeft\n\nRight\n\nFooter');
  });

  it('takes the words of texts and arrows, and nothing from frames or boxes', () => {
    const arrow = createArrow({
      id: 'a',
      x: 0,
      y: 200,
      points: [
        [0, 0],
        [100, 0],
      ],
      label: '  yes  ',
    });
    const shapes = [frame('f', 0, 0), box('blank', 0, 100), text('t', 0, 50, 'Words'), arrow];

    expect(copyTextOf(shapes)).toBe('Words\n\nyes');
    expect(hasWords(shapes)).toBe(true);
    expect(hasWords([frame('f', 0, 0), box('blank', 0, 100)])).toBe(false);
  });
});

describe('copyJsonOf', () => {
  it('writes the board’s own clipboard format, which pastes back as shapes', () => {
    const json = copyJsonOf([text('t', 0, 0, 'Hello')]);

    expect(json).toContain('\n  "type": "canvasflow/clipboard"');
    expect(clipboardContentFrom(json, () => 'new')).toMatchObject({
      kind: 'shapes',
      shapes: [{ id: 'new', kind: 'text', text: 'Hello' }],
    });
  });
});
