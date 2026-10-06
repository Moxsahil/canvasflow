import { describe, expect, it } from 'vitest';
import { isArrow } from '@canvasflow/canvas-engine';
import { readLibraryShapes } from './library-items';
import { LIBRARY_PACKS } from './library-packs';

let next = 0;
const genId = () => `p${(next += 1)}`;

describe('the packs', () => {
  const items = LIBRARY_PACKS.flatMap((pack) => pack.items);

  it('name every item, under an id of its own', () => {
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const item of items) expect(item.name.trim(), item.id).not.toBe('');
  });

  it('are made of shapes the sanitizer keeps whole, arrow ends and all', () => {
    for (const item of items) {
      const read = readLibraryShapes(JSON.parse(JSON.stringify(item.shapes)) as unknown[], genId);
      expect(read.skipped, item.id).toBe(0);
      expect(read.shapes, item.id).toHaveLength(item.shapes.length);
      const attached = (shapes: typeof read.shapes) =>
        shapes
          .filter(isArrow)
          .flatMap((arrow) => [arrow.startBinding, arrow.endBinding])
          .filter(Boolean).length;
      expect(attached(read.shapes), item.id).toBe(attached([...item.shapes]));
    }
  });

  it('look the same every time they are drawn', () => {
    const seeds = (shapes: readonly { seed: number }[]) => shapes.map((shape) => shape.seed);
    for (const item of items) {
      expect(
        seeds(item.shapes).every((seed) => Number.isFinite(seed)),
        item.id,
      ).toBe(true);
    }
    expect(seeds(items[0]!.shapes)).toEqual(seeds(LIBRARY_PACKS[0]!.items[0]!.shapes));
  });
});
