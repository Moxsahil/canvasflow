import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createArrow } from '../src/shapes/arrow';
import { createRectangle } from '../src/shapes/rectangle';
import { createText } from '../src/shapes/text';
import { fontSizeOf, shapeScale, strokeWidthOf } from '../src/shapes/shape';
import { textBoundsEstimate } from '../src/shapes/text';
import { arrowheadMarks } from '../src/utils/rough';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape';
import { sanitizeShape } from '../src/sanitize/sanitize-shape';

const rect = (scale?: number) =>
  createRectangle({ id: 'r', x: 0, y: 0, width: 10, height: 10, strokeWidth: 2, seed: 1, scale });

/** A Y.Map answers `get` only once it is in a document, as it is off the wire. */
function integrate(map: Y.Map<unknown>): Y.Map<unknown> {
  const doc = new Y.Doc();
  doc.getArray<Y.Map<unknown>>('shapes').push([map]);
  return doc.getArray<Y.Map<unknown>>('shapes').get(0);
}

describe('a shape carries the size it was drawn at', () => {
  it('multiplies the chosen stroke width, leaving the choice itself readable', () => {
    const shape = rect(4);
    // The panel asks the first question, the renderer the second.
    expect(shape.strokeWidth).toBe(2);
    expect(strokeWidthOf(shape)).toBe(8);
  });

  it('stores nothing at all when the board was drawn at 1:1', () => {
    expect(rect(1).scale).toBeUndefined();
    expect(rect().scale).toBeUndefined();
  });

  it('grows the text it measures as well as the text it draws', () => {
    const plain = createText({ id: 't', x: 0, y: 0, text: 'hello', fontSize: 20, seed: 1 });
    const scaled = createText({
      id: 't',
      x: 0,
      y: 0,
      text: 'hello',
      fontSize: 20,
      seed: 1,
      scale: 3,
    });

    expect(fontSizeOf(scaled)).toBe(60);
    // Selection outlines and hit-testing read the bounds, so they have to grow
    // with the glyphs or a scaled shape is unclickable where it is drawn.
    expect(textBoundsEstimate(scaled).height).toBeCloseTo(textBoundsEstimate(plain).height * 3, 5);
  });
});

describe('an arrowhead keeps up with the shaft it sits on', () => {
  /** How far back along the shaft the head reaches. */
  const headLength = (scale?: number) => {
    // Long enough that the head is capped by its own size, not by the arrow.
    const arrow = createArrow({
      id: 'a',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [1000, 0],
      ],
      endArrowhead: 'triangle',
      strokeWidth: 2,
      seed: 1,
      scale,
    });
    const mark = arrowheadMarks(arrow)[0];
    if (!mark || mark.kind !== 'closed') throw new Error('expected a closed arrowhead');
    const xs = mark.points.map(([x]) => x);
    return Math.max(...xs) - Math.min(...xs);
  };

  it('grows with the scale, so a thickened arrow is not left blunt', () => {
    expect(headLength(3)).toBeCloseTo(headLength() * 3, 5);
  });

  it('is unchanged for a shape drawn at 1:1', () => {
    expect(headLength(1)).toBe(headLength());
  });
});

describe('a scale that cannot be trusted reads as none', () => {
  it.each([
    ['zero, which would erase every stroke', 0],
    ['a negative, which would invert them', -2],
    ['NaN, which would spread through the bounds', Number.NaN],
    ['an infinity', Number.POSITIVE_INFINITY],
  ])('falls back to 1 for %s', (_why, value) => {
    expect(shapeScale({ scale: value })).toBe(1);
  });

  it('falls back to 1 for a shape written before scale existed', () => {
    expect(shapeScale({})).toBe(1);
  });
});

describe('scale survives the boundaries a board crosses', () => {
  it('round-trips through the shared document', () => {
    const restored = yMapToShape(integrate(shapeToYMap(rect(2.5))));
    expect(restored?.scale).toBe(2.5);
  });

  it('writes no key for an unscaled shape, so old boards stay byte-identical', () => {
    expect(integrate(shapeToYMap(rect())).has('scale')).toBe(false);
  });

  it('drops a stored scale that would break the board rather than using it', () => {
    const map = integrate(shapeToYMap(rect()));
    map.set('scale', 0);

    expect(yMapToShape(map)?.scale).toBeUndefined();
  });

  it('keeps a scale that arrives in a board file, and drops a broken one', () => {
    const good = sanitizeShape({ ...rect(3), kind: 'rectangle' }, () => 'new');
    expect(good?.scale).toBe(3);

    const bad = sanitizeShape({ ...rect(), kind: 'rectangle', scale: -1 }, () => 'new');
    expect(bad?.scale).toBeUndefined();
  });
});
