import { describe, expect, it } from 'vitest';
import { createRectangle } from '@canvasflow/canvas-engine';
import { importableItems, readLibraryFile, writeLibraryFile } from './library-files';

let next = 0;
const genId = () => `s${(next += 1)}`;

const box = (id: string, x = 0) => ({
  id,
  type: 'rectangle',
  x,
  y: 0,
  width: 40,
  height: 40,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
});

describe('readLibraryFile', () => {
  it('reads an Excalidraw library, version 2, with its item names', () => {
    const file = readLibraryFile(
      JSON.stringify({
        type: 'excalidrawlib',
        version: 2,
        libraryItems: [
          { id: 'i1', status: 'published', name: 'Server', elements: [box('a')] },
          { id: 'i2', status: 'published', elements: [box('b'), box('c', 60)] },
          { id: 'i3', status: 'published', elements: [{ id: 'p', type: 'image', x: 0, y: 0 }] },
        ],
      }),
      genId,
      'Kit',
    );
    expect(file?.format).toBe('excalidraw');
    // An item with no name and no words of its own is named after its library.
    expect(file?.items.map((item) => item.name)).toEqual(['Server', 'Kit 2']);
    expect(file?.emptyItems).toBe(1);
    expect(file?.imagesLeftOut).toBe(1);
  });

  it('reads an Excalidraw library, version 1, of bare element lists, named by their words', () => {
    const label = { id: 't', type: 'text', x: 0, y: 0, text: 'Queue', strokeColor: '#1e1e1e' };
    const file = readLibraryFile(
      JSON.stringify({
        type: 'excalidrawlib',
        version: 1,
        library: [[box('a'), label], [box('b')]],
      }),
      genId,
      'Kit',
    );
    expect(file?.items.map((item) => item.name)).toEqual(['Queue', 'Kit 2']);
  });

  it('reads back what it writes, frames and arrow ends included', () => {
    const shapes = [
      createRectangle({ id: 'a', x: 0, y: 0, width: 40, height: 40 }),
      createRectangle({ id: 'b', x: 100, y: 0, width: 40, height: 40 }),
    ];
    const file = readLibraryFile(writeLibraryFile([{ name: 'Pair', shapes }]), genId);
    expect(file?.format).toBe('canvasflow');
    expect(file?.items[0]?.name).toBe('Pair');
    expect(file?.items[0]?.shapes).toHaveLength(2);
    // Under new ids, as everything read from outside is.
    expect(file?.items[0]?.shapes.map((shape) => shape.id)).not.toContain('a');
  });

  it('is null for anything that is not a library', () => {
    expect(readLibraryFile('not json', genId)).toBeNull();
    expect(readLibraryFile(JSON.stringify({ type: 'excalidraw', elements: [] }), genId)).toBeNull();
    expect(readLibraryFile(JSON.stringify([1, 2]), genId)).toBeNull();
  });

  it('skips what the sanitizer will not take, rather than failing the file', () => {
    const file = readLibraryFile(
      JSON.stringify({
        type: 'canvasflow/library',
        version: 1,
        items: [
          { name: 'Bad', shapes: [{ kind: 'script', x: 0, y: 0 }] },
          { name: 'Good', shapes: [{ kind: 'ellipse', x: 0, y: 0, width: 5, height: 5 }] },
          'nonsense',
        ],
      }),
      genId,
    );
    expect(file?.items.map((item) => item.name)).toEqual(['Good']);
    expect(file?.emptyItems).toBe(2);
  });
});

describe('importableItems', () => {
  it('leaves out an item with more shapes than one may hold', () => {
    const many = Array.from({ length: 501 }, (_, i) =>
      createRectangle({ id: `r${i}`, x: i, y: 0, width: 1, height: 1 }),
    );
    const one = [createRectangle({ id: 'r', x: 0, y: 0, width: 1, height: 1 })];
    const { fit, tooLarge } = importableItems([
      { name: 'Many', shapes: many },
      { name: 'One', shapes: one },
    ]);
    expect(fit.map((item) => item.name)).toEqual(['One']);
    expect(tooLarge).toBe(1);
  });
});
