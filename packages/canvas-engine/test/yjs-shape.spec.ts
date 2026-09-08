import * as Y from 'yjs';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape.js';
import { shapeBounds } from '../src/shapes/bounds.js';
import { createArrow, createText, createRectangle } from '../src/shapes/index.js';
import type { ArrowShape, TextShape } from '../src/shapes/shape.js';

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

describe('arrow bindings through the document', () => {
  const bound = (startBinding: ArrowShape['startBinding']) =>
    createArrow({
      id: 'a',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [10, 10],
      ],
      startBinding,
    });

  it('carries an attachment there and back', () => {
    const shape = bound({ shapeId: 'target', anchor: { x: 0.25, y: 0.75 }, precise: true });
    const read = yMapToShape(integrate(shapeToYMap(shape))) as ArrowShape;

    expect(read.startBinding).toEqual({
      shapeId: 'target',
      anchor: { x: 0.25, y: 0.75 },
      precise: true,
    });
    expect(read.endBinding).toBeNull();
  });

  it('writes no key for an arrow attached to nothing', () => {
    const map = integrate(shapeToYMap(bound(null)));
    expect(map.get('startBinding')).toBeUndefined();
    expect((yMapToShape(map) as ArrowShape).startBinding).toBeNull();
  });

  it('reads an arrow saved before arrows could attach', () => {
    const map = new Y.Map<unknown>();
    map.set('id', 'old');
    map.set('kind', 'arrow');
    map.set('x', 0);
    map.set('y', 0);
    map.set('points', [
      [0, 0],
      [10, 10],
    ]);

    expect((yMapToShape(integrate(map)) as ArrowShape).startBinding).toBeNull();
  });

  it('drops an attachment it cannot make sense of', () => {
    // A binding with a missing anchor would put the arrow at NaN, and that
    // spreads from its bounds into the spatial index — so it is refused here
    // and the arrow is drawn where its own points say instead.
    for (const junk of [
      { shapeId: 'target' },
      { shapeId: 'target', anchor: { x: 'left', y: 0 } },
      { shapeId: '', anchor: { x: 0, y: 0 } },
      { anchor: { x: 0, y: 0 } },
      'target',
      null,
    ]) {
      const map = new Y.Map<unknown>();
      map.set('id', 'junk');
      map.set('kind', 'arrow');
      map.set('x', 0);
      map.set('y', 0);
      map.set('points', [
        [0, 0],
        [10, 10],
      ]);
      map.set('startBinding', junk);

      const read = yMapToShape(integrate(map)) as ArrowShape;
      expect(read.startBinding).toBeNull();
      expect(() => shapeBounds(read)).not.toThrow();
    }
  });
});
