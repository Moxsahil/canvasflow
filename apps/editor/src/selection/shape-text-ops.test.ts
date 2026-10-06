import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createArrow,
  createEllipse,
  createRectangle,
  createText,
  shapeTextLayout,
  type ArrowBinding,
} from '@canvasflow/canvas-engine';
import { DEFAULT_ITEM_STYLE } from '../machine/tool-machine.types';
import {
  bindablePair,
  bindTextToShape,
  unbindableShapes,
  unbindTextFromShape,
  wrappableTexts,
  wrapTextInShape,
} from './shape-text-ops';

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

const box = (label?: string) =>
  createRectangle({ id: 'box', x: 0, y: 0, width: 200, height: 100, ...(label && { label }) });
const text = (words = 'Hello', extra = {}) =>
  createText({ id: 'text', x: 20, y: 20, text: words, fontSize: 28, ...extra });

describe('bindablePair', () => {
  it('takes a text and a shape without words, and nothing else', () => {
    expect(bindablePair([text(), box()])).toMatchObject({
      text: { id: 'text' },
      container: { id: 'box' },
    });
    expect(bindablePair([box(), text()])).not.toBeNull();
    expect(bindablePair([text(), box('Taken')])).toBeNull();
    expect(
      bindablePair([text(), box(), createEllipse({ id: 'e', x: 0, y: 0, width: 1, height: 1 })]),
    ).toBeNull();
    expect(bindablePair([text()])).toBeNull();
  });
});

describe('bindTextToShape', () => {
  it('makes the text the shape’s words, centred, at the size it was drawn', () => {
    const { container, removeId } = bindTextToShape(text('Hi', { scale: 2 }), box());
    expect(removeId).toBe('text');
    expect(container).toMatchObject({ label: 'Hi', fontSize: 56, textAlign: 'center' });
  });

  it('grows the shape when the words need more room', () => {
    const { container } = bindTextToShape(text('one\ntwo\nthree\nfour\nfive'), box());
    expect(container.height).toBeGreaterThan(100);
  });
});

describe('unbindTextFromShape', () => {
  it('takes the words out as a text shape where they were drawn', () => {
    const shape = { ...box('Hello'), strokeColor: '#e03131', frameId: 'f1' };
    const result = unbindTextFromShape(shape, 'new');
    const layout = shapeTextLayout(shape)!;
    expect(result?.containerPatch).toEqual({ label: '' });
    expect(result?.text).toMatchObject({
      id: 'new',
      text: 'Hello',
      textAlign: 'center',
      x: layout.x,
      strokeColor: '#e03131',
      frameId: 'f1',
    });
    expect(unbindTextFromShape(box(), 'none')).toBeNull();
  });

  it('is offered for the shapes that have words', () => {
    expect(unbindableShapes([box('Hi'), box(), text()]).map((s) => s.label)).toEqual(['Hi']);
  });
});

describe('wrapTextInShape', () => {
  const bound = (shapeId: string): ArrowBinding => ({
    shapeId,
    anchor: { x: 0.5, y: 0.5 },
    precise: false,
  });

  it('draws a box round the text in the panel’s style, holding it', () => {
    const style = { ...DEFAULT_ITEM_STYLE, strokeColor: '#1971c2', fillColor: '#a5d8ff' };
    const { container, removeId } = wrapTextInShape(text('Hello'), 'wrap', style, []);
    expect(removeId).toBe('text');
    expect(container).toMatchObject({
      id: 'wrap',
      kind: 'rectangle',
      label: 'Hello',
      fontSize: 28,
      textAlign: 'center',
      strokeColor: '#1971c2',
      fillColor: '#a5d8ff',
    });
    expect(container.x).toBeLessThan(20);
    expect(container.width).toBeGreaterThan(0);
  });

  it('moves arrows attached to the text onto the box', () => {
    const arrow = createArrow({
      id: 'a',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [50, 0],
      ],
      startBinding: bound('text'),
      endBinding: bound('elsewhere'),
    });
    const { arrows } = wrapTextInShape(text(), 'wrap', DEFAULT_ITEM_STYLE, [arrow]);
    expect(arrows).toEqual([
      { id: 'a', patch: { startBinding: bound('wrap'), endBinding: bound('elsewhere') } },
    ]);
  });

  it('is offered for text shapes', () => {
    expect(wrappableTexts([box(), text()]).map((s) => s.id)).toEqual(['text']);
  });
});
