import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { rowCount, seed, testDb } from '../testing/harness.js';
import {
  EmptyUpdateError,
  UpdateTooLargeError,
  loadSnapshot,
  saveSnapshot,
} from './board-updates-store.js';

describe('board updates store', () => {
  it('returns null for a board with nothing stored', async () => {
    const s = await seed();
    expect(await loadSnapshot(testDb(), s.boardId)).toBeNull();
  });

  it('refuses empty and oversized snapshots without writing anything', async () => {
    const s = await seed();
    await expect(
      saveSnapshot(testDb(), s.boardId, s.owner.userId, new Uint8Array()),
    ).rejects.toThrow(EmptyUpdateError);
    await expect(
      saveSnapshot(testDb(), s.boardId, s.owner.userId, new Uint8Array(5_000_001)),
    ).rejects.toThrow(UpdateTooLargeError);
    expect(await rowCount(s.boardId)).toBe(0);
  });

  it('merges the retained snapshots, recovering writes from two writers', async () => {
    const s = await seed();
    // Two instances that each hold part of the room write snapshots neither of
    // which contains the other's edits.
    const a = new Y.Doc();
    a.getMap('shapes').set('from-a', 1);
    const b = new Y.Doc();
    b.getMap('shapes').set('from-b', 2);
    await saveSnapshot(testDb(), s.boardId, s.owner.userId, Y.encodeStateAsUpdate(a));
    await saveSnapshot(testDb(), s.boardId, s.owner.userId, Y.encodeStateAsUpdate(b));

    const merged = new Y.Doc();
    Y.applyUpdate(merged, (await loadSnapshot(testDb(), s.boardId))!);
    expect(merged.getMap('shapes').toJSON()).toEqual({ 'from-a': 1, 'from-b': 2 });
  });
});
