import { describe, expect, it } from 'vitest';
import {
  createArrow,
  createFrame,
  createImage,
  createRectangle,
  createText,
  isArrow,
  type ArrowBinding,
  type Shape,
} from '@canvasflow/canvas-engine';
import {
  LIBRARY_NAME_MAX,
  libraryItemName,
  libraryShapesFor,
  libraryThumbnail,
  readLibraryShapes,
} from './library-items';

function rect(id: string, x = 0, y = 0, extra: Partial<Shape> = {}): Shape {
  return { ...createRectangle({ id, x, y, width: 40, height: 40 }), ...extra } as Shape;
}

function boundTo(shapeId: string): ArrowBinding {
  return { shapeId, anchor: { x: 0.5, y: 0.5 }, precise: false };
}

function arrow(id: string, start: string | null, end: string | null, label?: string): Shape {
  return createArrow({
    id,
    x: 40,
    y: 20,
    points: [
      [0, 0],
      [100, 0],
    ],
    startBinding: start ? boundTo(start) : null,
    endBinding: end ? boundTo(end) : null,
    ...(label !== undefined && { label }),
  });
}

function frame(id: string, name = ''): Shape {
  return createFrame({ id, x: -10, y: -10, width: 300, height: 200, name });
}

function image(id: string): Shape {
  return createImage({
    id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    fileId: 'f',
    mimeType: 'image/png',
    naturalWidth: 10,
    naturalHeight: 10,
  });
}

/** Ids handed out in order, so a test can say which shape is which. */
function counter(prefix = 'n') {
  let n = 0;
  return () => `${prefix}${(n += 1)}`;
}

describe('libraryShapesFor', () => {
  it('takes a frame with what stands in it, and leaves the rest of the board', () => {
    const board = [frame('f'), rect('a', 0, 0, { frameId: 'f' }), rect('out', 900, 900)];
    const { shapes } = libraryShapesFor(['f'], board);
    expect(shapes.map((shape) => shape.id)).toEqual(['f', 'a']);
    expect(shapes[1]!.frameId).toBe('f');
  });

  it('lets go of what belongs to this board: locks, hiding, editors, outside references', () => {
    const board = [
      frame('f'),
      rect('a', 0, 0, { frameId: 'f', locked: true, lastEditedBy: 'u', lastEditedAt: 1 }),
      rect('b', 600, 0),
      arrow('x', 'a', 'b'),
    ];
    const { shapes } = libraryShapesFor(['a', 'x'], board);
    const a = shapes.find((shape) => shape.id === 'a')!;
    expect(a.locked).toBeUndefined();
    expect(a.lastEditedBy).toBeUndefined();
    expect(a.lastEditedAt).toBeUndefined();
    // Its frame did not come along.
    expect(a.frameId).toBeUndefined();

    const x = shapes.find((shape) => shape.id === 'x')!;
    expect(isArrow(x) && x.startBinding?.shapeId).toBe('a');
    expect(isArrow(x) && x.endBinding).toBeNull();
  });

  it('leaves out what the board hides, and images, and counts the images', () => {
    const board = [frame('f'), rect('a', 0, 0, { frameId: 'f', hidden: true }), image('i')];
    const { shapes, imagesLeftOut } = libraryShapesFor(['f', 'i'], board);
    expect(shapes.map((shape) => shape.id)).toEqual(['f']);
    expect(imagesLeftOut).toBe(1);
  });
});

describe('libraryItemName', () => {
  it('names an item after a named frame, then text, then an arrow’s caption', () => {
    expect(libraryItemName([rect('a'), frame('f', 'Checkout flow')])).toBe('Checkout flow');
    expect(
      libraryItemName([
        rect('a'),
        createText({ id: 't', x: 0, y: 0, text: '\n  API   gateway\nv2' }),
      ]),
    ).toBe('API gateway');
    expect(libraryItemName([arrow('x', null, null, 'calls')])).toBe('calls');
  });

  it('falls back to what the shapes are', () => {
    expect(libraryItemName([rect('a')])).toBe('Rectangle');
    expect(libraryItemName([rect('a'), rect('b')])).toBe('2 rectangles');
    expect(libraryItemName([rect('a'), arrow('x', null, null)])).toBe('2 shapes');
    expect(libraryItemName([frame('f')])).toBe('Frame');
  });

  it('keeps a long name within what the gateway takes', () => {
    const long = createText({ id: 't', x: 0, y: 0, text: 'x'.repeat(200) });
    expect(libraryItemName([long]).length).toBeLessThanOrEqual(LIBRARY_NAME_MAX);
  });
});

describe('readLibraryShapes', () => {
  it('rebuilds every shape under a new id, still joined to the others', () => {
    const stored = JSON.parse(
      JSON.stringify([rect('a'), rect('b', 400, 0), arrow('x', 'a', 'b')]),
    ) as unknown[];
    const { shapes, skipped } = readLibraryShapes(stored, counter());
    expect(skipped).toBe(0);
    expect(shapes.map((shape) => shape.id)).toEqual(['n1', 'n2', 'n3']);
    const x = shapes[2]!;
    expect(isArrow(x) && x.startBinding?.shapeId).toBe('n1');
    expect(isArrow(x) && x.endBinding?.shapeId).toBe('n2');
  });

  it('lets go of an attachment to a shape it does not hold, or with no sound anchor', () => {
    const stray = { ...arrow('x', 'gone', null) } as Record<string, unknown>;
    const bent = {
      ...arrow('y', 'a', null),
      startBinding: { shapeId: 'a', anchor: { x: 7, y: 0.5 }, precise: false },
    };
    const { shapes } = readLibraryShapes([rect('a'), stray, bent], counter());
    for (const shape of shapes.filter(isArrow)) expect(shape.startBinding).toBeNull();
  });

  it('works out which frame holds what from where the shapes are', () => {
    const stored = [frame('f'), rect('a', 20, 20, { frameId: 'elsewhere' }), rect('b', 900, 900)];
    const { shapes } = readLibraryShapes(stored, counter());
    expect(shapes[1]!.frameId).toBe('n1');
    expect(shapes[2]!.frameId ?? null).toBeNull();
  });

  it('skips what is not a shape, images among them, rather than drawing it', () => {
    const { shapes, skipped } = readLibraryShapes(
      [{ kind: 'rectangle', x: 'no' }, image('i'), { kind: 'script' }, rect('a')],
      counter(),
    );
    expect(shapes).toHaveLength(1);
    expect(skipped).toBe(3);
  });
});

describe('libraryThumbnail', () => {
  it('draws the shapes as an SVG for an image tag, or nothing for no shapes', () => {
    expect(libraryThumbnail([rect('a')], false)).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(libraryThumbnail([], false)).toBeNull();
  });
});
