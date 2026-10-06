import { describe, expect, it } from 'vitest';
import {
  LIBRARY_ITEM_MAX_BYTES,
  LIBRARY_ITEM_MAX_SHAPES,
  LIBRARY_NAME_MAX,
  parseLibraryItemInput,
  parseLibraryName,
} from './library.js';

const box = { id: 'a', kind: 'rectangle', x: 0, y: 0, width: 10, height: 10 };

describe('parseLibraryName', () => {
  it('trims a name and folds runs of space', () => {
    expect(parseLibraryName('  API   gateway ')).toEqual({ ok: true, name: 'API gateway' });
  });

  it('refuses an empty name, a long one, and anything not text', () => {
    expect(parseLibraryName('   ').ok).toBe(false);
    expect(parseLibraryName('x'.repeat(LIBRARY_NAME_MAX + 1)).ok).toBe(false);
    expect(parseLibraryName(42).ok).toBe(false);
  });
});

describe('parseLibraryItemInput', () => {
  it('takes a name and shapes, and measures them', () => {
    const parsed = parseLibraryItemInput({ name: 'Box', shapes: [box] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.name).toBe('Box');
      expect(parsed.value.sizeBytes).toBe(Buffer.byteLength(JSON.stringify([box])));
    }
  });

  it('refuses no shapes, too many, and things that are not shapes', () => {
    expect(parseLibraryItemInput({ name: 'x', shapes: [] }).ok).toBe(false);
    expect(parseLibraryItemInput({ name: 'x', shapes: 'box' }).ok).toBe(false);
    expect(parseLibraryItemInput({ name: 'x', shapes: [{ x: 1 }] }).ok).toBe(false);
    expect(parseLibraryItemInput({ name: 'x', shapes: [[1, 2]] }).ok).toBe(false);
    const many = Array.from({ length: LIBRARY_ITEM_MAX_SHAPES + 1 }, () => box);
    expect(parseLibraryItemInput({ name: 'x', shapes: many }).ok).toBe(false);
  });

  it('refuses an item past the size an item may be', () => {
    const long = {
      kind: 'freehand',
      points: Array.from({ length: LIBRARY_ITEM_MAX_BYTES / 8 }, () => [123.45, 678.9]),
    };
    expect(parseLibraryItemInput({ name: 'Scribble', shapes: [long] })).toEqual({
      ok: false,
      error: 'That is too large to keep in the library',
    });
  });

  it('refuses a body that is not an object', () => {
    expect(parseLibraryItemInput(null).ok).toBe(false);
    expect(parseLibraryItemInput('shapes').ok).toBe(false);
  });
});
