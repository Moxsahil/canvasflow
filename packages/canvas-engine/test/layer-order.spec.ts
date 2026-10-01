import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardDocument } from '../src/document/document';
import { createRectangle } from '../src/shapes/rectangle';

const rect = (id: string) => createRectangle({ id, x: 0, y: 0, width: 10, height: 10 });
const ids = (doc: BoardDocument) => doc.getShapes().map((shape) => shape.id);
const keys = (doc: BoardDocument) =>
  doc.getShapes().map((shape) => (shape as unknown as { zIndex: string }).zIndex);

const docs: BoardDocument[] = [];
function board(count: number) {
  const doc = new BoardDocument();
  docs.push(doc);
  for (let i = 0; i < count; i++) doc.addShape(rect(`s${i}`));
  return doc;
}
afterEach(() => docs.splice(0).forEach((doc) => doc.destroy()));

/** A board as clients before the fix left it: these shapes sharing one key. */
function sharing(doc: BoardDocument, shared: readonly string[], key: string) {
  const shapes = doc.yDoc.getArray<Y.Map<unknown>>('shapes');
  for (const yMap of shapes) if (shared.includes(yMap.get('id') as string)) yMap.set('zIndex', key);
}

describe('layer order', () => {
  it('draws shapes in the order they were added, however many there are', () => {
    const doc = board(120);

    expect(ids(doc)).toEqual(Array.from({ length: 120 }, (_, i) => `s${i}`));
    expect(new Set(keys(doc)).size).toBe(120);
  });

  it('brings a shape to the front of a board past thirty-six shapes', () => {
    const doc = board(60);
    doc.bringToFront('s5');

    expect(ids(doc).at(-1)).toBe('s5');
  });

  it('keeps shapes that already share a key in the order they were added', () => {
    const doc = board(5);
    sharing(doc, ['s1', 's2', 's3'], 'a1');

    expect(ids(doc)).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });

  it('steps a shape forward and back through others that share its key', () => {
    const doc = board(5);
    sharing(doc, ['s1', 's2', 's3'], 'a1');

    doc.bringForward('s1');
    expect(ids(doc)).toEqual(['s0', 's2', 's1', 's3', 's4']);
    doc.sendBackward('s3');
    expect(ids(doc)).toEqual(['s0', 's2', 's3', 's1', 's4']);
    // The shared key is gone, and the order everyone else sees is the same.
    expect(new Set(keys(doc)).size).toBe(5);
  });

  it('puts a new shape on top of a board that holds shared keys', () => {
    const doc = board(4);
    sharing(doc, ['s2', 's3'], 'a9');
    doc.addShape(rect('new'));

    expect(ids(doc).at(-1)).toBe('new');
  });
});
