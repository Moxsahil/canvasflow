import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardDocument } from '../src/document/document';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape';
import { exportRegion } from '../src/export/export-scene';
import { renderSceneToSvgString } from '../src/renderers/svg-scene';
import { sanitizeShape } from '../src/sanitize/sanitize-shape';
import { createFrame } from '../src/shapes/frame';
import { createRectangle } from '../src/shapes/rectangle';
import type { Shape } from '../src/shapes/shape';
import { hiddenShapeIds, visibleShapes } from '../src/shapes/visibility';

const box = (id: string, x = 0, extra: Partial<Shape> = {}): Shape =>
  ({ ...createRectangle({ id, x, y: 0, width: 10, height: 10, seed: 1 }), ...extra }) as Shape;
const frame = (id: string, extra: Partial<Shape> = {}): Shape =>
  ({ ...createFrame({ id, x: -50, y: -50, width: 200, height: 200 }), ...extra }) as Shape;
const sorted = (ids: Iterable<string>) => [...ids].sort();

describe('hiddenShapeIds', () => {
  it('finds nothing on a board with nothing hidden, and hands the list back as it was', () => {
    const shapes = [box('a'), frame('f')];
    expect(hiddenShapeIds(shapes).size).toBe(0);
    expect(visibleShapes(shapes)).toBe(shapes);
  });

  it('hides a shape by its own flag, and everything in a hidden frame', () => {
    const shapes = [
      frame('outer', { hidden: true }),
      frame('inner', { frameId: 'outer' }),
      box('deep', 0, { frameId: 'inner' }),
      box('own', 0, { hidden: true }),
      box('shown'),
    ];
    expect(sorted(hiddenShapeIds(shapes))).toEqual(['deep', 'inner', 'outer', 'own']);
    expect(visibleShapes(shapes).map((s) => s.id)).toEqual(['shown']);
  });
});

describe('stored visibility', () => {
  const integrate = (map: Y.Map<unknown>) => {
    const doc = new Y.Doc();
    doc.getArray<Y.Map<unknown>>('shapes').push([map]);
    return doc.getArray<Y.Map<unknown>>('shapes').get(0);
  };

  it('round-trips, and writes no key for a shown shape', () => {
    expect(yMapToShape(integrate(shapeToYMap(box('a', 0, { hidden: true }))))?.hidden).toBe(true);
    expect(integrate(shapeToYMap(box('a'))).has('hidden')).toBe(false);
  });

  it('reads anything but true as shown', () => {
    const map = integrate(shapeToYMap(box('a')));
    map.set('hidden', 1);
    expect(yMapToShape(map)?.hidden).toBeUndefined();
  });

  it('keeps a hidden shape hidden through a board file', () => {
    expect(sanitizeShape(box('a', 0, { hidden: true }), () => 'n')?.hidden).toBe(true);
  });
});

describe('BoardDocument and visibility', () => {
  it('hides and shows a locked shape, which takes no other change', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([box('a', 0, { locked: true })]);
    doc.updateShapes([{ id: 'a', patch: { hidden: true } }]);
    expect(doc.getShapes()[0]?.hidden).toBe(true);
    doc.updateShape('a', { hidden: false });
    expect(doc.getShapes()[0]?.hidden).toBeUndefined();
    doc.updateShapes([{ id: 'a', patch: { hidden: true, x: 40 } }]);
    expect(doc.getShapes()[0]).toMatchObject({ x: 0 });
    expect(doc.getShapes()[0]?.hidden).toBeUndefined();
    doc.destroy();
  });

  it('keeps a hidden member hidden in a copy of its frame', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([frame('f'), box('m', 0, { frameId: 'f', hidden: true })]);
    let n = 0;
    doc.duplicateShapes(['f', 'm'], { dx: 300, dy: 0 }, () => `copy-${++n}`);
    expect(doc.getShapes().find((s) => s.id === 'copy-2')?.hidden).toBe(true);
    doc.destroy();
  });
});

describe('export', () => {
  it('leaves hidden shapes out of the picture and of its edges', () => {
    const shapes = [box('a', 0), box('far', 1000, { hidden: true })];
    expect(exportRegion(shapes, { padding: 0 })).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    const svg = renderSceneToSvgString(shapes, { padding: 0 });
    expect(svg).toContain('viewBox="0 0 10 10"');
    expect(renderSceneToSvgString([box('a')], { padding: 0 })).toBe(svg);
  });
});
