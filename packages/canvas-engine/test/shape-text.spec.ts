import * as Y from 'yjs';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape.js';
import { drawSceneShape } from '../src/renderers/draw-shape.js';
import { renderSceneToSvgString } from '../src/renderers/svg-scene.js';
import { sanitizeShape } from '../src/sanitize/sanitize-shape.js';
import { findTextMatches, matchRects } from '../src/search/find-text.js';
import { createDiamond, createEllipse, createRectangle } from '../src/shapes/index.js';
import {
  fitShapeToText,
  SHAPE_TEXT_PADDING,
  shapeTextArea,
  shapeTextFields,
  shapeTextFont,
  shapeTextLayout,
  shapeTextOf,
  wrapText,
} from '../src/shapes/shape-text.js';
import type { RectangleShape } from '../src/shapes/shape.js';
import { measureTextWidth } from '../src/utils/text-measure.js';
import { createRoughCanvas } from '../src/utils/rough.js';

function box(overrides: Partial<RectangleShape> = {}): RectangleShape {
  return {
    ...createRectangle({ id: 'r1', x: 0, y: 0, width: 200, height: 100, roughness: 0, seed: 3 }),
    ...overrides,
  };
}

const FONT = '20px sans-serif';

describe('shapeTextFields', () => {
  it('keeps only what says something, so a shape without words carries no keys', () => {
    expect(shapeTextFields({})).toEqual({});
    expect(
      shapeTextFields({ label: '', fontSize: 0, fontFamily: '', textAlign: 'x' as never }),
    ).toEqual({});
    expect(shapeTextFields({ label: 'Hi', fontSize: 28, textAlign: 'left' })).toEqual({
      label: 'Hi',
      fontSize: 28,
      textAlign: 'left',
    });
  });

  it('reads words that are not a string as none', () => {
    expect(shapeTextOf({ label: 42 as never })).toBe('');
  });
});

describe('shapeTextFont', () => {
  it('defaults to the board text, centred, scaled with the shape', () => {
    const font = shapeTextFont(box({ scale: 2 }));
    expect(font.fontSize).toBe(40);
    expect(font.textAlign).toBe('center');
    expect(font.fontFamily).toContain('Caveat');
  });
});

describe('shapeTextArea', () => {
  const pad = SHAPE_TEXT_PADDING;

  it('is the whole of a box, less the padding', () => {
    expect(shapeTextArea(box())).toEqual({
      x: pad,
      y: pad,
      width: 200 - pad * 2,
      height: 100 - pad * 2,
    });
  });

  it('is the rectangle inscribed in an ellipse, and in a diamond', () => {
    const ellipse = createEllipse({ id: 'e', x: 0, y: 0, width: 200, height: 100 });
    const inEllipse = shapeTextArea(ellipse);
    expect(inEllipse.width).toBeCloseTo(200 * Math.SQRT1_2 - pad * 2);
    expect(inEllipse.x + inEllipse.width / 2).toBeCloseTo(100);

    const diamond = createDiamond({ id: 'd', x: 0, y: 0, width: 200, height: 100 });
    const inDiamond = shapeTextArea(diamond);
    expect(inDiamond.width).toBeCloseTo(100 - pad * 2);
    expect(inDiamond.height).toBeCloseTo(50 - pad * 2);
  });

  it('is the right way out for a box drawn backwards', () => {
    const area = shapeTextArea(box({ x: 200, y: 100, width: -200, height: -100 }));
    expect(area.x).toBe(pad);
    expect(area.width).toBe(200 - pad * 2);
  });
});

describe('wrapText', () => {
  it('breaks between words, keeping its own line breaks', () => {
    const word = measureTextWidth('word', FONT);
    const lines = wrapText('word word word\nend', FONT, word * 2.5);
    expect(lines).toEqual(['word word', 'word', 'end']);
  });

  it('breaks a word only when it is wider than the line', () => {
    const width = measureTextWidth('abcd', FONT);
    const lines = wrapText('abcdefghij', FONT, width);
    expect(lines.join('')).toBe('abcdefghij');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureTextWidth(line, FONT)).toBeLessThanOrEqual(width);
  });

  it('keeps empty lines', () => {
    expect(wrapText('a\n\nb', FONT, 500)).toEqual(['a', '', 'b']);
  });
});

describe('shapeTextLayout', () => {
  it('is nothing for a shape without words, unless they are being typed', () => {
    expect(shapeTextLayout(box())).toBeNull();
    expect(shapeTextLayout(box(), { caret: true })).not.toBeNull();
  });

  it('centres the words in the shape, both ways', () => {
    const layout = shapeTextLayout(box({ label: 'Hello' }))!;
    expect(layout.x).toBe(100);
    expect(layout.textTop + layout.height / 2).toBeCloseTo(50);
    expect(layout.lines).toEqual(['Hello']);
  });

  it('aligns to a side when told to', () => {
    expect(shapeTextLayout(box({ label: 'Hi', textAlign: 'left' }))!.x).toBe(SHAPE_TEXT_PADDING);
    expect(shapeTextLayout(box({ label: 'Hi', textAlign: 'right' }))!.x).toBe(
      200 - SHAPE_TEXT_PADDING,
    );
  });

  it('starts at the top once the words no longer fit, rather than climbing out', () => {
    const layout = shapeTextLayout(box({ height: 30, label: 'one\ntwo\nthree' }))!;
    expect(layout.textTop).toBe(shapeTextArea(box({ height: 30 })).y);
  });
});

describe('fitShapeToText', () => {
  it('grows a shape taller to hold its words, from its top', () => {
    const fitted = fitShapeToText(box({ height: 30, label: 'one\ntwo\nthree\nfour' }));
    expect(fitted.y).toBe(0);
    expect(fitted.height).toBeGreaterThan(30);
    const layout = shapeTextLayout(fitted)!;
    expect(layout.height).toBeLessThanOrEqual(layout.area.height + 1);
  });

  it('never shrinks a shape drawn larger than its words', () => {
    const roomy = box({ label: 'Hi' });
    expect(fitShapeToText(roomy)).toBe(roomy);
    expect(fitShapeToText(box())).toEqual(box());
  });

  it('widens a shape to keep its longest word on one line', () => {
    const fitted = fitShapeToText(box({ width: 40, label: 'Internationalisation' }));
    expect(fitted.width).toBeGreaterThan(40);
    expect(shapeTextLayout(fitted)!.lines).toEqual(['Internationalisation']);
  });

  it('grows an ellipse and a diamond enough for the inside to hold the words', () => {
    for (const shape of [
      createEllipse({ id: 'e', x: 0, y: 0, width: 300, height: 40, label: 'a\nb\nc\nd' }),
      createDiamond({ id: 'd', x: 0, y: 0, width: 300, height: 40, label: 'a\nb\nc\nd' }),
    ]) {
      const layout = shapeTextLayout(fitShapeToText(shape))!;
      expect(layout.height, shape.kind).toBeLessThanOrEqual(layout.area.height + 1);
    }
  });
});

describe('words in shapes on the way through the document', () => {
  function integrate(map: Y.Map<unknown>): Y.Map<unknown> {
    const doc = new Y.Doc();
    doc.getArray<Y.Map<unknown>>('shapes').push([map]);
    return doc.getArray<Y.Map<unknown>>('shapes').get(0);
  }

  it('round-trips the words and their style', () => {
    const shape = yMapToShape(
      integrate(shapeToYMap(box({ label: 'Hi\nthere', fontSize: 28, textAlign: 'left' }))),
    ) as RectangleShape;
    expect(shape).toMatchObject({ label: 'Hi\nthere', fontSize: 28, textAlign: 'left' });
  });

  it('writes no keys for a shape without words', () => {
    const map = shapeToYMap(box());
    for (const key of ['label', 'fontSize', 'fontFamily', 'textAlign']) {
      expect(map.has(key), key).toBe(false);
    }
  });

  it('reads a Y.Text where the words belong as its text', () => {
    const map = integrate(shapeToYMap(box()));
    const text = new Y.Text();
    map.set('label', text);
    text.insert(0, 'from elsewhere');
    expect((yMapToShape(map) as RectangleShape).label).toBe('from elsewhere');
  });

  it('keeps them through the sanitizer, and drops what is not words', () => {
    const kept = sanitizeShape(box({ label: 'Hi', fontSize: 28 }), () => 'n1') as RectangleShape;
    expect(kept).toMatchObject({ label: 'Hi', fontSize: 28 });
    const dropped = sanitizeShape(
      { ...box(), label: { evil: true } },
      () => 'n2',
    ) as RectangleShape;
    expect(dropped.label).toBeUndefined();
  });
});

describe('drawing and exporting words in shapes', () => {
  function inkAt(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, size = 20) {
    const { data } = ctx.getImageData(x - size / 2, y - size / 2, size, size);
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) return true;
    return false;
  }

  function paint(shape: RectangleShape, editingLabelId?: string) {
    const canvas = new OffscreenCanvas(220, 120);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    drawSceneShape(ctx, createRoughCanvas(canvas), shape, false, { editingLabelId });
    return ctx;
  }

  it('paints the words in the middle of the shape, unless they are open for typing', () => {
    expect(inkAt(paint(box()), 100, 50)).toBe(false);
    expect(inkAt(paint(box({ label: 'Hello' })), 100, 50)).toBe(true);
    expect(inkAt(paint(box({ label: 'Hello' }), 'r1'), 100, 50)).toBe(false);
  });

  it('exports them in an SVG, line by line', () => {
    const svg = renderSceneToSvgString([
      fitShapeToText(box({ width: 120, label: 'one two three four' })),
    ]);
    expect(svg).toContain('text-anchor="middle"');
    expect((svg.match(/<text /g) ?? []).length).toBeGreaterThan(1);
  });
});

describe('searching words in shapes', () => {
  it('finds them, and marks them where the wrapped line draws them', () => {
    const shape = box({ id: 'b', width: 140, label: 'alpha beta gamma delta' });
    const { matches } = findTextMatches([shape], 'gamma');
    expect(matches).toEqual([{ shapeId: 'b', index: 11, length: 5 }]);

    const [rect] = matchRects(shape, 11, 5);
    const layout = shapeTextLayout(shape)!;
    const line = layout.lines.findIndex((text) => text.includes('gamma'));
    expect(rect!.y).toBeCloseTo(layout.textTop + line * layout.fontSize * 1.2);
    expect(rect!.width).toBeCloseTo(
      measureTextWidth('gamma', `${layout.fontSize}px ${layout.fontFamily}`),
    );
  });
});

describe('a shape drawn in the panel’s style', () => {
  it('takes no text style until it is given words', () => {
    const drawn = createRectangle({
      id: 'r',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fontSize: 36,
      fontFamily: 'Helvetica',
      textAlign: 'left',
    });
    expect(drawn.textAlign).toBeUndefined();
    expect(drawn.fontSize).toBeUndefined();
    expect(shapeTextFont(drawn).textAlign).toBe('center');

    const worded = createRectangle({
      id: 'w',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      label: 'Hi',
      textAlign: 'left',
    });
    expect(worded.textAlign).toBe('left');
  });
});
