import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { mergeSnapshots } from './merge-snapshots.js';

function snapshotOf(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

describe('mergeSnapshots', () => {
  it('has nothing to give for a board never saved', () => {
    expect(mergeSnapshots([])).toBeNull();
  });

  it('hands a lone snapshot back untouched', () => {
    const doc = new Y.Doc();
    doc.getArray('shapes').push(['a']);
    const only = snapshotOf(doc);
    expect(mergeSnapshots([only])).toBe(only);
  });

  it('keeps what either of two writers saved', () => {
    const base = new Y.Doc();
    base.getArray('shapes').push(['a']);
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, snapshotOf(base));
    Y.applyUpdate(right, snapshotOf(base));
    left.getArray('shapes').push(['b']);
    right.getArray('shapes').push(['c']);

    const merged = new Y.Doc();
    Y.applyUpdate(merged, mergeSnapshots([snapshotOf(left), snapshotOf(right)])!);
    expect([...merged.getArray('shapes').toArray()].sort()).toEqual(['a', 'b', 'c']);
  });
});
