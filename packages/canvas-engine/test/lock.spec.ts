import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardDocument } from '../src/document/document';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape';
import { sanitizeShape } from '../src/sanitize/sanitize-shape';
import { createArrow } from '../src/shapes/arrow';
import { createFrame } from '../src/shapes/frame';
import { lockSourcesOf, lockedShapeIds } from '../src/shapes/lock';
import { createRectangle } from '../src/shapes/rectangle';
import type { Shape } from '../src/shapes/shape';

const box = (id: string, extra: Partial<Shape> = {}): Shape =>
  ({ ...createRectangle({ id, x: 0, y: 0, width: 10, height: 10 }), ...extra }) as Shape;
const frame = (id: string, extra: Partial<Shape> = {}): Shape =>
  ({ ...createFrame({ id, x: -50, y: -50, width: 200, height: 200 }), ...extra }) as Shape;
const arrowBetween = (id: string, from: string | null, to: string | null): Shape =>
  createArrow({
    id,
    x: 0,
    y: 0,
    points: [
      [0, 0],
      [100, 0],
    ],
    startBinding: from ? { shapeId: from, anchor: { x: 0.5, y: 0.5 }, precise: false } : null,
    endBinding: to ? { shapeId: to, anchor: { x: 0.5, y: 0.5 }, precise: false } : null,
  });

const sorted = (ids: Iterable<string>) => [...ids].sort();

describe('lockedShapeIds', () => {
  it('finds nothing on a board with no lock', () => {
    expect(lockedShapeIds([box('a'), frame('f'), arrowBetween('x', 'a', null)]).size).toBe(0);
  });

  it('locks a shape by its own flag', () => {
    expect(sorted(lockedShapeIds([box('a', { locked: true }), box('b')]))).toEqual(['a']);
  });

  it('locks everything standing in a locked frame, at any depth', () => {
    const shapes = [
      frame('outer', { locked: true }),
      frame('inner', { frameId: 'outer' }),
      box('deep', { frameId: 'inner' }),
      box('loose'),
    ];
    expect(sorted(lockedShapeIds(shapes))).toEqual(['deep', 'inner', 'outer']);
  });

  it('locks an arrow attached to a locked shape at either end', () => {
    const shapes = [
      box('a', { locked: true }),
      box('b'),
      arrowBetween('from-locked', 'a', 'b'),
      arrowBetween('to-locked', 'b', 'a'),
      arrowBetween('free', 'b', null),
    ];
    expect(sorted(lockedShapeIds(shapes))).toEqual(['a', 'from-locked', 'to-locked']);
  });

  it('locks an arrow attached to a shape that a locked frame holds', () => {
    const shapes = [frame('f', { locked: true }), box('member', { frameId: 'f' }), box('out')];
    const arrow = arrowBetween('x', 'out', 'member');
    expect(lockedShapeIds([...shapes, arrow]).has('x')).toBe(true);
  });

  it('survives a frame chain that loops', () => {
    const shapes = [frame('a', { frameId: 'b' }), frame('b', { frameId: 'a', locked: true })];
    expect(sorted(lockedShapeIds(shapes))).toEqual(['a', 'b']);
  });
});

describe('lockSourcesOf', () => {
  it('names the flag that has to come off for each shape to be free', () => {
    const shapes = [
      frame('f', { locked: true }),
      box('member', { frameId: 'f' }),
      box('own', { locked: true }),
      box('both', { frameId: 'f', locked: true }),
      arrowBetween('arrow', 'own', null),
      box('free'),
    ];
    expect(lockSourcesOf(['member'], shapes)).toEqual(['f']);
    expect(lockSourcesOf(['own'], shapes)).toEqual(['own']);
    expect(sorted(lockSourcesOf(['both'], shapes))).toEqual(['both', 'f']);
    expect(lockSourcesOf(['arrow'], shapes)).toEqual(['own']);
    expect(lockSourcesOf(['free'], shapes)).toEqual([]);
  });
});

describe('stored lock', () => {
  const integrate = (map: Y.Map<unknown>) => {
    const doc = new Y.Doc();
    doc.getArray<Y.Map<unknown>>('shapes').push([map]);
    return doc.getArray<Y.Map<unknown>>('shapes').get(0);
  };

  it('round-trips, and writes no key for a shape that is not locked', () => {
    expect(yMapToShape(integrate(shapeToYMap(box('a', { locked: true }))))?.locked).toBe(true);
    expect(integrate(shapeToYMap(box('a'))).has('locked')).toBe(false);
  });

  it('reads anything but true as unlocked', () => {
    const map = integrate(shapeToYMap(box('a')));
    map.set('locked', 'yes');
    expect(yMapToShape(map)?.locked).toBeUndefined();
  });

  it('keeps a lock through a board file', () => {
    expect(sanitizeShape(box('a', { locked: true }), () => 'n')?.locked).toBe(true);
    expect(sanitizeShape(box('a', { locked: 'yes' as never }), () => 'n')?.locked).toBeUndefined();
  });
});

describe('BoardDocument and locked shapes', () => {
  const board = (...shapes: Shape[]) => {
    const doc = new BoardDocument();
    doc.replaceShapes(shapes);
    return doc;
  };
  const get = (doc: BoardDocument, id: string) => doc.getShapes().find((s) => s.id === id);

  it('refuses every change to a locked shape but unlocking it', () => {
    const doc = board(box('a', { locked: true }));
    doc.updateShape('a', { x: 50 });
    doc.updateShapes([{ id: 'a', patch: { strokeColor: '#ff0000' } }]);
    expect(get(doc, 'a')).toMatchObject({ x: 0, locked: true });
    expect(get(doc, 'a')?.strokeColor).not.toBe('#ff0000');

    doc.updateShapes([{ id: 'a', patch: { locked: false } }]);
    expect(get(doc, 'a')?.locked).toBeUndefined();
    doc.updateShape('a', { x: 50 });
    expect(get(doc, 'a')?.x).toBe(50);
    doc.destroy();
  });

  it('refuses changes to what a locked frame holds and to arrows on a locked shape', () => {
    const doc = board(
      frame('f', { locked: true }),
      box('member', { frameId: 'f' }),
      box('a', { locked: true }),
      box('b'),
      arrowBetween('arrow', 'a', 'b'),
    );
    doc.updateShapes([
      { id: 'member', patch: { x: 9 } },
      { id: 'arrow', patch: { x: 9 } },
      { id: 'b', patch: { x: 9 } },
    ]);
    expect(get(doc, 'member')?.x).toBe(0);
    expect(get(doc, 'arrow')?.x).toBe(0);
    expect(get(doc, 'b')?.x).toBe(9);
    doc.destroy();
  });

  it('lets a caller move a locked shape it vouches for', () => {
    const doc = board(box('a', { locked: true }), arrowBetween('arrow', 'a', null));
    doc.updateShapes([{ id: 'a', patch: { x: 5 } }], { allowLocked: new Set(['a']) });
    doc.updateShape('arrow', { x: 7 }, { allowLocked: true });
    expect(get(doc, 'a')?.x).toBe(5);
    expect(get(doc, 'arrow')?.x).toBe(7);
    doc.destroy();
  });

  it('does not delete, nudge or reorder a locked shape', () => {
    const doc = board(box('a', { locked: true }), box('b'), box('c'));
    const order = () => doc.getShapes().map((s) => s.id);
    doc.deleteShapes(['a', 'b']);
    expect(order()).toEqual(['a', 'c']);
    doc.nudgeShapes(['a', 'c'], 3, 4);
    expect(get(doc, 'a')).toMatchObject({ x: 0, y: 0 });
    expect(get(doc, 'c')).toMatchObject({ x: 3, y: 4 });
    doc.bringToFront('a');
    doc.updateShapes([], { bringToFront: ['a'] });
    expect(order()).toEqual(['a', 'c']);
    doc.destroy();
  });

  it('duplicates a locked shape unlocked, and out of a locked frame it stood in', () => {
    const doc = board(frame('f', { locked: true }), box('member', { frameId: 'f', locked: true }));
    const [copyId] = doc.duplicateShapes(['member'], { dx: 10, dy: 10 }, () => 'copy');
    const copy = get(doc, copyId!);
    expect(copy?.locked).toBeUndefined();
    expect(copy?.frameId).toBeUndefined();
    expect(doc.lockedIds().has('copy')).toBe(false);
    doc.destroy();
  });

  it('locks and unlocks as one undo step each', () => {
    const doc = board(box('a'));
    doc.breakUndoGroup();
    doc.updateShapes([{ id: 'a', patch: { locked: true } }]);
    expect(doc.lockedIds().has('a')).toBe(true);
    doc.undo();
    expect(doc.lockedIds().has('a')).toBe(false);
    doc.destroy();
  });
});
