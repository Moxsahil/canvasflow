import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECENTS_LIMIT,
  RECENTS_STORAGE_KEY,
  readRecents,
  storeRecents,
  withRecent,
} from './recents';
import type { CommandId } from './commands';

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  });
});

describe('withRecent', () => {
  it('puts the command at the front', () => {
    expect(withRecent(['undo', 'redo'], 'copy')).toEqual(['copy', 'undo', 'redo']);
  });

  it('moves a command already listed rather than repeating it', () => {
    expect(withRecent(['undo', 'redo', 'copy'], 'redo')).toEqual(['redo', 'undo', 'copy']);
  });

  it('keeps the list to its limit, dropping the oldest', () => {
    const ids = ['undo', 'redo', 'copy', 'cut', 'paste'] as CommandId[];
    const next = withRecent(ids, 'duplicate');
    expect(next).toHaveLength(RECENTS_LIMIT);
    expect(next[0]).toBe('duplicate');
    expect(next).not.toContain('paste');
  });
});

describe('readRecents', () => {
  it('returns nothing when there is nothing stored', () => {
    expect(readRecents()).toEqual([]);
  });

  it('reads back what was stored', () => {
    storeRecents(['undo', 'copy']);
    expect(readRecents()).toEqual(['undo', 'copy']);
  });

  it('drops ids that are no longer commands', () => {
    store[RECENTS_STORAGE_KEY] = JSON.stringify(['undo', 'somethingRemoved', 'copy']);
    expect(readRecents()).toEqual(['undo', 'copy']);
  });

  it('drops repeats', () => {
    store[RECENTS_STORAGE_KEY] = JSON.stringify(['undo', 'undo', 'copy']);
    expect(readRecents()).toEqual(['undo', 'copy']);
  });

  it('ignores entries that are not strings', () => {
    store[RECENTS_STORAGE_KEY] = JSON.stringify(['undo', 42, null, 'copy']);
    expect(readRecents()).toEqual(['undo', 'copy']);
  });

  it('survives unparseable storage', () => {
    store[RECENTS_STORAGE_KEY] = 'not json';
    expect(readRecents()).toEqual([]);
  });

  it('survives storage holding something that is not a list', () => {
    store[RECENTS_STORAGE_KEY] = JSON.stringify({ undo: true });
    expect(readRecents()).toEqual([]);
  });

  it('never returns more than the limit', () => {
    store[RECENTS_STORAGE_KEY] = JSON.stringify([
      'undo',
      'redo',
      'copy',
      'cut',
      'paste',
      'duplicate',
      'selectAll',
    ]);
    expect(readRecents()).toHaveLength(RECENTS_LIMIT);
  });

  it('survives storage that refuses to be read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readRecents()).toEqual([]);
    expect(() => storeRecents(['undo'])).not.toThrow();
  });
});
