import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cameraStorageKey, readCamera, storeCamera } from './camera-storage';
import { MAX_ZOOM, MIN_ZOOM, type Camera } from '../machine/tool-machine.types';

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

describe('readCamera', () => {
  it('gives back the view that was stored', () => {
    storeCamera('board-1', { x: -400, y: -150, zoom: 2 });
    expect(readCamera('board-1')).toEqual({ x: -400, y: -150, zoom: 2 });
  });

  it('opens at the origin when the board has never been looked at', () => {
    expect(readCamera('board-1')).toBeNull();
  });

  it('keeps each board to its own view', () => {
    storeCamera('board-1', { x: 10, y: 20, zoom: 1 });
    storeCamera('board-2', { x: 30, y: 40, zoom: 1 });

    expect(readCamera('board-1')).toEqual({ x: 10, y: 20, zoom: 1 });
    expect(readCamera('board-2')).toEqual({ x: 30, y: 40, zoom: 1 });
  });

  it('opens at the origin rather than throwing on unreadable storage', () => {
    store[cameraStorageKey('board-1')] = 'not json';
    expect(readCamera('board-1')).toBeNull();
  });

  it('refuses a view with a missing or unusable part', () => {
    for (const written of [
      '{"x":1,"y":2}',
      '{"x":1,"y":2,"zoom":null}',
      '{"x":"1","y":2,"zoom":1}',
      '[1,2,3]',
      'null',
    ]) {
      store[cameraStorageKey('board-1')] = written;
      expect(readCamera('board-1')).toBeNull();
    }
  });

  it('refuses a view that is not a finite place on the board', () => {
    // JSON has no Infinity or NaN, but a hand-edited or corrupted entry can
    // still parse to one through a number literal that overflows.
    store[cameraStorageKey('board-1')] = '{"x":1e999,"y":0,"zoom":1}';
    expect(readCamera('board-1')).toBeNull();
  });

  it('brings a zoom from outside this build’s range to the nearest it allows', () => {
    store[cameraStorageKey('board-1')] = JSON.stringify({ x: 5, y: 5, zoom: 40 });
    expect(readCamera('board-1')).toEqual({ x: 5, y: 5, zoom: MAX_ZOOM });

    store[cameraStorageKey('board-1')] = JSON.stringify({ x: 5, y: 5, zoom: 0.001 });
    expect(readCamera('board-1')).toEqual({ x: 5, y: 5, zoom: MIN_ZOOM });
  });
});

describe('storeCamera', () => {
  it('writes only the view, not whatever else the camera object carries', () => {
    storeCamera('board-1', { x: 1, y: 2, zoom: 3, stray: 'ignored' } as unknown as Camera);

    const written = store[cameraStorageKey('board-1')];
    expect(written).toBeDefined();
    expect(JSON.parse(written ?? 'null')).toEqual({ x: 1, y: 2, zoom: 3 });
  });

  it('carries on when storage refuses the write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    expect(() => storeCamera('board-1', { x: 1, y: 2, zoom: 1 })).not.toThrow();
  });
});
