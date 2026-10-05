import { describe, expect, it } from 'vitest';
import { createFrame, createRectangle, SpatialIndex, type Shape } from '@canvasflow/canvas-engine';
import { contextPressAt } from './context-target';

function rect(id: string, x: number, y: number): Shape {
  return createRectangle({ id, x, y, width: 100, height: 100 });
}

function press(
  point: { x: number; y: number },
  shapes: Shape[],
  selectedIds: string[],
  locked: ReadonlySet<string> = new Set(),
) {
  const index = new SpatialIndex();
  index.rebuild(shapes);
  return contextPressAt(point, shapes, selectedIds, index, 1, locked);
}

describe('contextPressAt', () => {
  const a = rect('a', 0, 0);
  const b = rect('b', 300, 0);

  it('selects the shape under the pointer', () => {
    expect(press({ x: 50, y: 50 }, [a, b], [])).toEqual({ target: 'selection', select: ['a'] });
  });

  it('swaps a selection elsewhere for the shape that was clicked', () => {
    expect(press({ x: 350, y: 50 }, [a, b], ['a'])).toEqual({
      target: 'selection',
      select: ['b'],
    });
  });

  it('keeps a selection when the click lands in the gap between its shapes', () => {
    // Between a and b, on neither: the pair is what was right-clicked.
    expect(press({ x: 200, y: 50 }, [a, b], ['a', 'b'])).toEqual({
      target: 'selection',
      select: null,
    });
  });

  it('clears the selection and opens the board menu on empty board', () => {
    expect(press({ x: 200, y: 500 }, [a, b], ['a'])).toEqual({ target: 'canvas', select: [] });
  });

  it('leaves an empty selection alone on empty board', () => {
    expect(press({ x: 200, y: 500 }, [a, b], [])).toEqual({ target: 'canvas', select: null });
  });

  it('treats the middle of an unselected frame as board, as a left click does', () => {
    const frame = createFrame({ id: 'f', x: 0, y: 0, width: 400, height: 400 });
    expect(press({ x: 200, y: 200 }, [frame], [])).toEqual({ target: 'canvas', select: null });
  });

  it('keeps a selected frame when its middle is clicked', () => {
    const frame = createFrame({ id: 'f', x: 0, y: 0, width: 400, height: 400 });
    expect(press({ x: 200, y: 200 }, [frame], ['f'])).toEqual({
      target: 'selection',
      select: null,
    });
  });
});

describe('contextPressAt, with locked shapes', () => {
  const below = rect('below', 0, 0);
  const lockedOnTop = rect('locked', 0, 0);

  it('picks out a locked shape when nothing else is under the pointer, to unlock it', () => {
    expect(press({ x: 50, y: 50 }, [lockedOnTop], [], new Set(['locked']))).toEqual({
      target: 'selection',
      select: ['locked'],
    });
  });

  it('passes over a locked shape for an unlocked one under it, as a click does', () => {
    expect(press({ x: 50, y: 50 }, [below, lockedOnTop], [], new Set(['locked']))).toEqual({
      target: 'selection',
      select: ['below'],
    });
  });
});
