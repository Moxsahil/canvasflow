import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aimCarry, clearCarry, noteCarry, readCarry } from './carry';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the note to bring the local board along', () => {
  it('is there after leaving for an account, aimed nowhere yet', () => {
    noteCarry({ share: true });
    expect(readCarry()).toMatchObject({ target: null, share: true });
  });

  it('can be pointed at the board made for the drawing', () => {
    noteCarry();
    const note = readCarry()!;
    aimCarry(note, 'board-1');
    expect(readCarry()).toMatchObject({ target: 'board-1', share: false });
  });

  it('is dropped after an hour, from a sign-in that never finished', () => {
    noteCarry();
    const at = readCarry()!.at;
    expect(readCarry(at + 59 * 60 * 1000)).not.toBeNull();
    expect(readCarry(at + 60 * 60 * 1000)).toBeNull();
    // And gone for good, not only ignored.
    expect(readCarry(at)).toBeNull();
  });

  it('is gone once the drawing has been brought along', () => {
    noteCarry();
    clearCarry();
    expect(readCarry()).toBeNull();
  });

  it('ignores something it did not write', () => {
    window.localStorage.setItem('canvasflow:carry-local-board', '{"at":"soon"}');
    expect(readCarry()).toBeNull();
  });
});
