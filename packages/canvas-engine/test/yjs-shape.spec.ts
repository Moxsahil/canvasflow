import * as Y from 'yjs';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape.js';
import { shapeBounds } from '../src/shapes/bounds.js';
import { createText, createRectangle } from '../src/shapes/index.js';
import type { TextShape } from '../src/shapes/shape.js';

/** Put a Y.Map into a doc, as it would be when read back off the wire. */
function integrate(map: Y.Map<unknown>): Y.Map<unknown> {
  const doc = new Y.Doc();
  doc.getArray<Y.Map<unknown>>('shapes').push([map]);
  return doc.getArray<Y.Map<unknown>>('shapes').get(0);
}

describe('yMapToShape', () => {
  it('round-trips a text shape', () => {
    const original = createText({ id: 't1', x: 5, y: 6, text: 'hello\nworld' });
    const shape = yMapToShape(integrate(shapeToYMap(original))) as TextShape;

    expect(shape.kind).toBe('text');
    expect(shape.text).toBe('hello\nworld');
  });

  it('round-trips the style fields', () => {
    const original = createRectangle({
      id: 'r1',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      opacity: 40,
      roughness: 2,
      strokeStyle: 'dashed',
      fillStyle: 'cross-hatch',
      fillColor: '#ffc9c9',
      edges: 'round',
    });
    const shape = yMapToShape(integrate(shapeToYMap(original)));

    expect(shape).toMatchObject({
      opacity: 40,
      roughness: 2,
      strokeStyle: 'dashed',
      fillStyle: 'cross-hatch',
      edges: 'round',
    });
  });

  it('defaults style fields absent from older persisted shapes', () => {
    // A shape as written before the style fields existed.
    const legacy = new Y.Map<unknown>();
    legacy.set('id', 'old');
    legacy.set('kind', 'rectangle');
    legacy.set('x', 0);
    legacy.set('y', 0);
    legacy.set('width', 10);
    legacy.set('height', 10);

    const shape = yMapToShape(integrate(legacy));

    expect(shape).toMatchObject({
      opacity: 100,
      roughness: 1,
      strokeStyle: 'solid',
      fillStyle: 'hachure',
      edges: 'sharp',
    });
  });

  // A board was found persisting Y.Text here. It reached `.split()` as an
  // object and white-screened the editor, so the reader must not trust it.
  it('coerces a Y.Text text value to a string', () => {
    const doc = new Y.Doc();
    const map = new Y.Map<unknown>();
    doc.getArray<Y.Map<unknown>>('shapes').push([map]);
    map.set('id', 'yt');
    map.set('kind', 'text');
    map.set('x', 0);
    map.set('y', 0);
    map.set('text', new Y.Text('i am mox'));

    const shape = yMapToShape(doc.getArray<Y.Map<unknown>>('shapes').get(0)) as TextShape;

    expect(typeof shape.text).toBe('string');
    expect(shape.text).toBe('i am mox');
    // The real symptom: bounds must be computable rather than throwing.
    expect(() => shapeBounds(shape)).not.toThrow();
  });

  it('falls back to empty text when the value is missing', () => {
    const map = new Y.Map<unknown>();
    map.set('id', 'no-text');
    map.set('kind', 'text');
    map.set('x', 0);
    map.set('y', 0);

    const shape = yMapToShape(integrate(map)) as TextShape;

    expect(shape.text).toBe('');
    expect(() => shapeBounds(shape)).not.toThrow();
  });
});
