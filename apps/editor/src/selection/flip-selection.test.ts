import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BoardDocument,
  boundArrowPatches,
  computeBoundingRect,
  createArrow,
  createFrame,
  createImage,
  createLine,
  createRectangle,
  isArrow,
  type ArrowShape,
  type FlipAxis,
  type Shape,
} from '@canvasflow/canvas-engine';
import { withFreshIds, shapesCentredOn } from '../clipboard/paste-placement';
import { resizeShape } from '../machine/tool-machine';
import { canFlipSelection, flipSelection, selectionFlipUpdates } from './flip-selection';

const rect = (id: string, x: number, y = 0, width = 100, height = 100) =>
  createRectangle({ id, x, y, width, height, seed: 1 });
const image = () =>
  createImage({
    id: 'image',
    x: 20,
    y: 30,
    width: 80,
    height: 40,
    fileId: 'pixels',
    mimeType: 'image/png',
    naturalWidth: 80,
    naturalHeight: 40,
    seed: 1,
  });
const bound = (shapeId: string, x = 0.5, y = 0.5) => ({ shapeId, anchor: { x, y }, precise: true });
const docs: BoardDocument[] = [];
function documentWith(board: readonly Shape[] = []) {
  const doc = new BoardDocument();
  doc.replaceShapes([...board]);
  docs.push(doc);
  return doc;
}
afterEach(() => {
  docs.splice(0).forEach((doc) => doc.destroy());
});

function flipped(board: readonly Shape[], ids: readonly string[], axis: FlipAxis): Shape[] {
  const patches = new Map(
    selectionFlipUpdates(ids, board, axis).map(({ id, patch }) => [id, patch]),
  );
  return board.map((shape) =>
    patches.has(shape.id) ? ({ ...shape, ...patches.get(shape.id) } as Shape) : shape,
  );
}
function byId(board: readonly Shape[], id: string): Shape {
  return board.find((shape) => shape.id === id)!;
}
function terminals(shape: Shape) {
  if (!isArrow(shape)) throw new Error('Expected arrow');
  return [shape.points[0]!, shape.points[shape.points.length - 1]!].map(([x, y]) => ({
    x: shape.x + x,
    y: shape.y + y,
  }));
}
function connectedBoard(): Shape[] {
  const a = rect('a', 0);
  const b = rect('b', 300, 120);
  const arrow = createArrow({
    id: 'arrow',
    x: 80,
    y: 25,
    points: [
      [0, 0],
      [240, 170],
    ],
    startBinding: bound('a', 0.8, 0.25),
    endBinding: bound('b', 0.2, 0.75),
    startArrowhead: 'circle',
    endArrowhead: 'triangle',
    seed: 1,
  });
  const patch = boundArrowPatches([arrow], new Map([a, b, arrow].map((s) => [s.id, s])))[0];
  return [a, b, { ...arrow, ...patch }];
}

describe('selection flip geometry', () => {
  it.each(['horizontal', 'vertical'] as const)(
    'reflects a mixed selection around a shared center: %s',
    (axis) => {
      const board = [
        rect('a', -100, -50, 40, 30),
        rect('b', 200, 100, 100, 80),
        rect('other', 900),
      ];
      const before = structuredClone(board);
      const selected = ['a', 'b'];
      const result = flipped(board, selected, axis);
      expect(computeBoundingRect(result.slice(0, 2))).toEqual(
        computeBoundingRect(board.slice(0, 2)),
      );
      if (axis === 'horizontal') {
        expect(result[0]).toMatchObject({ x: 260, y: -50, width: 40 });
        expect(result[1]).toMatchObject({ x: -100, y: 100, width: 100 });
      } else {
        expect(result[0]).toMatchObject({ x: -100, y: 150, height: 30 });
        expect(result[1]).toMatchObject({ x: 200, y: -50, height: 80 });
      }
      expect(result[2]).toBe(board[2]);
      expect(flipped(result, selected, axis)).toEqual(board);
      expect(board).toEqual(before);
    },
  );

  it('keeps a zero-width line valid when flipped vertically', () => {
    const line = createLine({
      id: 'l',
      x: 10,
      y: -30,
      points: [
        [0, 0],
        [0, 90],
      ],
      seed: 1,
    });
    expect(flipped([line], ['l'], 'vertical')[0]).toMatchObject({
      x: 10,
      y: 60,
      points: [
        [0, 0],
        [0, -90],
      ],
    });
    expect(flipped(flipped([line], ['l'], 'vertical'), ['l'], 'vertical')).toEqual([line]);
  });

  it('returns no updates for empty, missing or symmetric selections', () => {
    const board = [rect('a', 10)];
    expect(canFlipSelection([], board)).toBe(false);
    expect(canFlipSelection(['missing'], board)).toBe(false);
    expect(selectionFlipUpdates([], board, 'horizontal')).toEqual([]);
    expect(selectionFlipUpdates(['a'], board, 'horizontal')).toEqual([]);
  });
});

describe('frame flips', () => {
  it('uses the frame center despite overflowing contents and visits nested members once', () => {
    const outer = createFrame({ id: 'outer', x: 0, y: 0, width: 200, height: 200, name: 'Board' });
    const inner = {
      ...createFrame({ id: 'inner', x: 20, y: 30, width: 80, height: 80 }),
      frameId: 'outer',
    };
    const child = { ...rect('child', 30, 40, 20, 20), frameId: 'inner' };
    const overflow = { ...rect('overflow', 190, 100, 20, 30), frameId: 'outer' };
    const board = [outer, inner, child, overflow];
    const result = flipped(board, ['outer', 'inner', 'child'], 'horizontal');
    expect(result[0]).toEqual(outer);
    expect(result[1]).toMatchObject({ x: 100, y: 30, frameId: 'outer' });
    expect(result[2]).toMatchObject({ x: 150, y: 40, frameId: 'inner' });
    expect(result[3]).toMatchObject({ x: -10, y: 100, frameId: 'outer' });
    expect(flipped(result, ['outer', 'inner', 'child'], 'horizontal')).toEqual(board);
  });

  it('reflects multiple selected frames and their explicitly selected descendants once', () => {
    const left = createFrame({ id: 'left', x: 0, y: 0, width: 200, height: 200 });
    const right = createFrame({ id: 'right', x: 400, y: 0, width: 200, height: 200 });
    const inner = {
      ...createFrame({ id: 'inner', x: 20, y: 20, width: 100, height: 100 }),
      frameId: 'left',
    };
    const child = { ...rect('child', 30, 30, 20, 20), frameId: 'inner' };
    const board = [left, right, inner, child];
    const ids = board.map((shape) => shape.id);
    const result = flipped(board, ids, 'horizontal');
    expect(result[0]).toMatchObject({ x: 400 });
    expect(result[1]).toMatchObject({ x: 0 });
    expect(result[2]).toMatchObject({ x: 480, frameId: 'left' });
    expect(result[3]).toMatchObject({ x: 550, frameId: 'inner' });
    expect(flipped(result, ids, 'horizontal')).toEqual(board);
  });

  it('reassigns independently flipped members without adopting unrelated shapes', () => {
    const frame = createFrame({ id: 'f', x: 0, y: 0, width: 200, height: 200 });
    const member = { ...rect('member', 20, 20, 20, 20), frameId: 'f' };
    const outside = rect('outside', 300, 20, 20, 20);
    const untouched = rect('untouched', 80, 80, 20, 20);
    const result = flipped(
      [frame, member, outside, untouched],
      ['member', 'outside'],
      'horizontal',
    );
    expect(byId(result, 'member')).toMatchObject({ x: 300, frameId: null });
    expect(byId(result, 'outside')).toMatchObject({ x: 20, frameId: 'f' });
    expect(byId(result, 'untouched')).toBe(untouched);
  });
});

describe('arrow bindings', () => {
  it('requires every existing bound target and ignores stale selected ids', () => {
    const board = connectedBoard();
    expect(canFlipSelection(['arrow'], board)).toBe(false);
    expect(selectionFlipUpdates(['arrow'], board, 'horizontal')).toEqual([]);
    expect(flipped(board, ['arrow', 'a'], 'horizontal')).toEqual(board);
    expect(canFlipSelection(['arrow', 'a', 'b'], board)).toBe(true);
    expect(canFlipSelection(['arrow', 'a', 'b'], [board[2]!])).toBe(false);
  });

  it.each(['horizontal', 'vertical'] as const)(
    'reflects connected geometry and anchors together without drift: %s',
    (axis) => {
      const board = connectedBoard();
      const result = flipped(board, ['a', 'b', 'arrow'], axis);
      const beforeEnds = terminals(board[2]!);
      const afterEnds = terminals(result[2]!);
      const original = board[2] as ArrowShape;
      const arrow = result[2] as ArrowShape;
      expect(arrow.startArrowhead).toBe(original.startArrowhead);
      expect(arrow.endArrowhead).toBe(original.endArrowhead);
      expect(arrow.startBinding?.shapeId).toBe('a');
      expect(arrow.endBinding?.shapeId).toBe('b');
      for (let i = 0; i < 2; i++) {
        expect(afterEnds[i]!.x).toBeCloseTo(
          axis === 'horizontal' ? 400 - beforeEnds[i]!.x : beforeEnds[i]!.x,
          8,
        );
        expect(afterEnds[i]!.y).toBeCloseTo(
          axis === 'vertical' ? 220 - beforeEnds[i]!.y : beforeEnds[i]!.y,
          8,
        );
      }
      const restored = flipped(result, ['a', 'b', 'arrow'], axis);
      terminals(restored[2]!).forEach((point, i) => {
        expect(point.x).toBeCloseTo(beforeEnds[i]!.x, 8);
        expect(point.y).toBeCloseTo(beforeEnds[i]!.y, 8);
      });
      expect(restored.slice(0, 2)).toEqual(board.slice(0, 2));
    },
  );

  it('settles external arrows without moving their free end or mirroring their anchors', () => {
    const a = rect('a', 0);
    const b = rect('b', 300);
    const arrow = createArrow({
      id: 'arrow',
      x: -100,
      y: 50,
      points: [
        [0, 0],
        [98, 0],
      ],
      // Fixed to the middle of a's left edge, where an arrow from the left
      // would have been attached.
      endBinding: bound('a', 0, 0.5),
    });
    const result = flipped([a, b, arrow], ['a', 'b'], 'horizontal');
    // The head meets b's left edge: half of b's stroke and half of the
    // arrow's own short of its outline at x=300.
    expect(terminals(result[2]!)).toEqual([
      { x: -100, y: 50 },
      { x: 298, y: 50 },
    ]);
    expect((result[2] as ArrowShape).endBinding).toEqual(arrow.endBinding);
  });
});

describe('flip transaction', () => {
  it('publishes one complete update with all shapes and connections', () => {
    const doc = documentWith(connectedBoard());
    const remote = documentWith();
    remote.applyUpdate(doc.encodeState());
    const change = vi.fn();
    const remoteChange = vi.fn();
    const sync = vi.fn((update: Uint8Array) => remote.applyUpdate(update));
    doc.onChange(change);
    remote.onChange(remoteChange);
    doc.yDoc.on('update', sync);
    flipSelection(doc, ['a', 'b', 'arrow'], 'horizontal');
    expect(change).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(remoteChange).toHaveBeenCalledTimes(1);
    expect(remote.getShapes()).toEqual(doc.getShapes());
  });

  it('isolates undo from adjacent edits and reverses geometry plus membership together', () => {
    const frame = createFrame({ id: 'f', x: 0, y: 0, width: 200, height: 200 });
    const doc = documentWith([
      frame,
      { ...rect('a', 20, 20, 20, 20), frameId: 'f' },
      rect('b', 300, 20, 20, 20),
    ]);
    const before = doc.getShapes();
    flipSelection(doc, ['a', 'b'], 'horizontal');
    const after = doc.getShapes();
    doc.updateShape('b', { opacity: 50 });
    doc.undo();
    expect(doc.getShapes()).toEqual(after);
    doc.undo();
    expect(doc.getShapes()).toEqual(before);
    doc.redo();
    expect(doc.getShapes()).toEqual(after);
  });

  it('keeps a newly framed shape visible with layer repair in the same undo and sync update', () => {
    const frame = {
      ...createFrame({ id: 'f', x: 0, y: 0, width: 200, height: 200 }),
      fillColor: '#ffffff',
    };
    const unrelated = { ...rect('unrelated', 80, 80, 20, 20), frameId: 'f' };
    const arriving = rect('a', 300, 20, 20, 20);
    const leaving = { ...rect('b', 20, 20, 20, 20), frameId: 'f' };
    const doc = documentWith([unrelated, arriving, frame, leaving]);
    const before = doc.getShapes();
    const sync = vi.fn();
    doc.yDoc.on('update', sync);
    flipSelection(doc, ['a', 'b'], 'horizontal');
    const after = doc.getShapes();
    expect(after.map(({ id }) => id)).toEqual(['unrelated', 'f', 'b', 'a']);
    expect(byId(after, 'a')).toMatchObject({ x: 20, frameId: 'f' });
    expect(byId(after, 'unrelated')).toEqual(byId(before, 'unrelated'));
    expect(sync).toHaveBeenCalledTimes(1);
    doc.undo();
    expect(doc.getShapes()).toEqual(before);
    doc.redo();
    expect(doc.getShapes()).toEqual(after);
  });

  it('raises an arriving frame before its descendants so the contents remain visible', () => {
    const parent = {
      ...createFrame({ id: 'parent', x: 0, y: 0, width: 250, height: 250 }),
      fillColor: '#ffffff',
    };
    const inner = createFrame({ id: 'inner', x: 300, y: 20, width: 100, height: 100 });
    const child = { ...rect('child', 320, 30, 20, 20), frameId: 'inner' };
    const marker = { ...rect('marker', 0, 20, 100, 100), frameId: 'parent' };
    const doc = documentWith([child, inner, parent, marker]);
    flipSelection(doc, ['inner', 'marker'], 'horizontal');
    expect(doc.getShapes().map(({ id }) => id)).toEqual(['parent', 'marker', 'inner', 'child']);
    expect(byId(doc.getShapes(), 'inner')).toMatchObject({ x: 0, frameId: 'parent' });
    expect(byId(doc.getShapes(), 'child')).toMatchObject({ x: 60, frameId: 'inner' });
  });

  it('preserves image flags through undo, redo, reload, duplication, clipboard and resize', () => {
    const doc = documentWith([image()]);
    flipSelection(doc, ['image'], 'horizontal');
    flipSelection(doc, ['image'], 'vertical');
    expect(doc.getShapes()[0]).toMatchObject({ flipX: true, flipY: true, fileId: 'pixels' });
    doc.undo();
    expect(doc.getShapes()[0]).toMatchObject({ flipX: true });
    expect(Boolean((doc.getShapes()[0] as ReturnType<typeof image>).flipY)).toBe(false);
    doc.redo();
    const reloaded = documentWith();
    reloaded.applyUpdate(doc.encodeState());
    expect(reloaded.getShapes()).toEqual(doc.getShapes());
    doc.duplicateShapes(['image'], { dx: 10, dy: 10 }, () => 'copy');
    expect(byId(doc.getShapes(), 'copy')).toMatchObject({ flipX: true, flipY: true });
    const [copy] = shapesCentredOn(
      withFreshIds(doc.getShapes().slice(0, 1), () => 'pasted'),
      { x: 500, y: 500 },
      [],
    );
    expect(copy).toMatchObject({ flipX: true, flipY: true });
    expect(resizeShape(copy!, 4, 40, 20)).toMatchObject({ flipX: true, flipY: true });
  });

  it('creates no change or undo entry for a no-op or a read-only board', () => {
    const doc = documentWith([rect('a', 0)]);
    const previous = doc.peekUndoItem();
    const changed = vi.fn();
    doc.onChange(changed);
    flipSelection(doc, ['a'], 'horizontal');
    expect(doc.peekUndoItem()).toBe(previous);
    expect(changed).not.toHaveBeenCalled();
    const readonly = documentWith([image()]);
    const before = readonly.getShapes();
    readonly.setReadOnly(true);
    flipSelection(readonly, ['image'], 'horizontal');
    expect(readonly.getShapes()).toEqual(before);
  });
});

describe('what rests on a flipped shape', () => {
  it('is told what was reflected and about which point, inside the same undo step', () => {
    const doc = documentWith([rect('a', 0), rect('b', 300), image()]);
    const pins = doc.yDoc.getMap<number>('pins');
    doc.trackInUndo(pins);
    pins.set('x', 0.25);
    doc.breakUndoGroup();
    const told: { reflected: string[]; center: { x: number; y: number } }[] = [];

    flipSelection(doc, ['a', 'b', 'image'], 'horizontal', ({ reflected, center }) => {
      told.push({ reflected: [...reflected].sort(), center });
      pins.set('x', 0.75);
    });

    expect(told).toEqual([{ reflected: ['a', 'b', 'image'], center: { x: 200, y: 50 } }]);
    expect(pins.get('x')).toBe(0.75);
    doc.undo();
    expect(pins.get('x')).toBe(0.25);
  });

  it('leaves out text, whose words keep their reading order', () => {
    const board: Shape[] = [rect('a', 0), rect('b', 300)];
    const doc = documentWith(board);
    let reflected: string[] = [];
    flipSelection(doc, ['a', 'b'], 'horizontal', (flip) => {
      reflected = [...flip.reflected];
    });
    expect(reflected.sort()).toEqual(['a', 'b']);

    // Nothing to tell when nothing changed.
    let called = false;
    flipSelection(doc, ['a'], 'horizontal', () => {
      called = true;
    });
    expect(called).toBe(false);
  });
});
