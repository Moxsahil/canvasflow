import { describe, expect, it } from 'vitest';
import {
  computeBoundingRect,
  createArrow,
  createFrame,
  createRectangle,
  isArrow,
  type ArrowBinding,
  type Shape,
} from '@canvasflow/canvas-engine';
import { shapesCentredOn, withFreshIds } from './paste-placement';

function frame(id: string, x: number, y: number, width = 200, height = 100): Shape {
  return createFrame({ id, x, y, width, height });
}

function rect(id: string, x: number, y: number, frameId?: string): Shape {
  const shape = createRectangle({ id, x, y, width: 20, height: 20 });
  return frameId ? { ...shape, frameId } : shape;
}

function boundTo(shapeId: string): ArrowBinding {
  return { shapeId, anchor: { x: 0.5, y: 0.5 }, precise: false };
}

function arrow(id: string, start: string | null, end: string | null): Shape {
  return createArrow({
    id,
    x: 20,
    y: 10,
    points: [
      [0, 0],
      [80, 0],
    ],
    startBinding: start ? boundTo(start) : null,
    endBinding: end ? boundTo(end) : null,
  });
}

/** Ids handed out in order, so a test can say which copy is which. */
function counter(prefix = 'new') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function byId(shapes: readonly Shape[], id: string): Shape {
  const found = shapes.find((shape) => shape.id === id);
  if (!found) throw new Error(`no shape ${id}`);
  return found;
}

function ends(shape: Shape): [string | null, string | null] {
  if (!isArrow(shape)) throw new Error(`${shape.id} is not an arrow`);
  return [shape.startBinding?.shapeId ?? null, shape.endBinding?.shapeId ?? null];
}

function centreOf(shapes: readonly Shape[]) {
  const bounds = computeBoundingRect(shapes)!;
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

describe('withFreshIds', () => {
  it('gives every shape a new id and changes nothing else about it', () => {
    const original = rect('a', 10, 20);
    const copies = withFreshIds([original, rect('b', 30, 40)], counter());

    expect(copies.map((shape) => shape.id)).toEqual(['new-1', 'new-2']);
    expect(copies[0]).toEqual({ ...original, id: 'new-1' });
  });

  it('puts a copied member in the copy of its frame, not back in the original', () => {
    const copies = withFreshIds([frame('f', 0, 0), rect('a', 50, 50, 'f')], counter());

    expect(copies[1]!.frameId).toBe('new-1');
  });

  it('leaves a member copied without its frame in the frame it came from', () => {
    const copies = withFreshIds([rect('a', 50, 50, 'f')], counter());

    expect(copies[0]!.frameId).toBe('f');
  });

  it('joins a copied arrow to the copies of what it joined', () => {
    const copies = withFreshIds(
      [rect('a', 0, 0), rect('b', 100, 0), arrow('c', 'a', 'b')],
      counter(),
    );

    expect(ends(copies[2]!)).toEqual(['new-1', 'new-2']);
  });

  it('keeps an arrow end attached to a shape that was not copied', () => {
    const copies = withFreshIds([rect('a', 0, 0), arrow('c', 'a', 'elsewhere')], counter());

    expect(ends(copies[1]!)).toEqual(['new-1', 'elsewhere']);
  });

  it('tells apart two entries that claim the same id', () => {
    const copies = withFreshIds([rect('a', 0, 0), rect('a', 50, 50)], counter());

    expect(new Set(copies.map((shape) => shape.id)).size).toBe(2);
  });
});

describe('shapesCentredOn', () => {
  it('puts the middle of a single shape on the point', () => {
    const [placed] = shapesCentredOn([rect('a', 0, 0)], { x: 500, y: 300 }, []);

    expect(placed).toMatchObject({ x: 490, y: 290 });
  });

  it('moves a group as one, its middle on the point and its layout intact', () => {
    const group = [rect('a', 0, 0), rect('b', 180, 80)];
    const placed = shapesCentredOn(group, { x: 1000, y: 1000 }, []);

    expect(centreOf(placed)).toEqual({ x: 1000, y: 1000 });
    expect(byId(placed, 'b').x - byId(placed, 'a').x).toBe(180);
    expect(byId(placed, 'b').y - byId(placed, 'a').y).toBe(80);
  });

  it('returns nothing for nothing, rather than a point to centre on', () => {
    expect(shapesCentredOn([], { x: 0, y: 0 }, [])).toEqual([]);
  });

  it('drops a shape into the frame it lands in', () => {
    const board = [frame('f', 400, 400)];
    const [placed] = shapesCentredOn([rect('a', 0, 0)], { x: 500, y: 450 }, board);

    expect(placed!.frameId).toBe('f');
  });

  it('takes a shape out of the frame it was copied from when it lands outside it', () => {
    // Left holding the frame's id, it would be cropped to a frame it is
    // nowhere near — drawn as nothing at all.
    const board = [frame('f', 0, 0), rect('original', 50, 50, 'f')];
    const [placed] = shapesCentredOn([rect('a', 50, 50, 'f')], { x: 900, y: 900 }, board);

    expect(placed!.frameId).toBeNull();
  });

  it('keeps a frame’s contents in it when they arrive together', () => {
    // The member hangs off the frame's edge with its centre outside, which
    // geometry alone would call loose. It came in the frame, so it stays.
    const group = [frame('f', 0, 0), rect('a', 195, 50, 'f')];
    const placed = shapesCentredOn(group, { x: 900, y: 900 }, []);

    expect(byId(placed, 'a').frameId).toBe('f');
    expect(byId(placed, 'f').frameId).toBeNull();
  });

  it('lets a loose shape join a frame that arrived with it', () => {
    const group = [frame('f', 0, 0), rect('a', 50, 50)];
    const placed = shapesCentredOn(group, { x: 900, y: 900 }, []);

    expect(byId(placed, 'a').frameId).toBe('f');
  });

  it('prefers a frame arriving on top to the board frame underneath it', () => {
    const board = [frame('under', 800, 850)];
    const group = [frame('f', 0, 0), rect('a', 50, 50)];
    const placed = shapesCentredOn(group, { x: 900, y: 900 }, board);

    expect(byId(placed, 'a').frameId).toBe('f');
  });

  it('does not let two frames arriving on the same spot each hold the other', () => {
    const group = [frame('f', 0, 0), frame('g', 0, 0)];
    const placed = shapesCentredOn(group, { x: 900, y: 900 }, []);

    expect(byId(placed, 'f').frameId).toBe('g');
    expect(byId(placed, 'g').frameId).toBeNull();
  });

  it('lets go of an arrow end whose shape was left behind, and keeps the one that came', () => {
    const group = [rect('a', 0, 0), arrow('c', 'a', 'left-behind')];
    const placed = shapesCentredOn(group, { x: 900, y: 900 }, [rect('left-behind', 100, 0)]);

    expect(ends(byId(placed, 'c'))).toEqual(['a', null]);
  });

  it('leaves an arrow the shape it had, moved along with the rest', () => {
    const group = [rect('a', 0, 0), arrow('c', 'a', null)];
    const placed = shapesCentredOn(group, { x: 900, y: 900 }, []);
    const before = byId(group, 'c');
    const after = byId(placed, 'c');

    if (!isArrow(before) || !isArrow(after)) throw new Error('expected arrows');
    expect(after.points).toEqual(before.points);
    // The box started at the origin, so where it is now is how far both moved.
    expect(after.x - before.x).toBe(byId(placed, 'a').x);
    expect(after.y - before.y).toBe(byId(placed, 'a').y);
  });
});
