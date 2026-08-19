import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSystemTheme, readStoredTheme, storeTheme, THEME_STORAGE_KEY } from './theme';

function stubStorage(store: Record<string, string>, { throws = false } = {}) {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      if (throws) throw new Error('storage unavailable');
      return store[key] ?? null;
    },
    setItem: (key: string, value: string) => {
      if (throws) throw new Error('storage unavailable');
      store[key] = value;
    },
  });
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('window', { matchMedia: () => ({ matches }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readStoredTheme', () => {
  it('returns a stored preference', () => {
    stubStorage({ [THEME_STORAGE_KEY]: 'dark' });
    expect(readStoredTheme()).toBe('dark');
  });

  it('falls back to system when nothing is stored', () => {
    stubStorage({});
    expect(readStoredTheme()).toBe('system');
  });

  it('rejects a value that is not one of the three preferences', () => {
    // Guards against an older or hand-edited key putting the UI in a state
    // with no matching option.
    stubStorage({ [THEME_STORAGE_KEY]: 'midnight' });
    expect(readStoredTheme()).toBe('system');
  });

  it('falls back to system when storage is unavailable', () => {
    stubStorage({}, { throws: true });
    expect(readStoredTheme()).toBe('system');
  });
});

describe('storeTheme', () => {
  it('writes the preference', () => {
    const store: Record<string, string> = {};
    stubStorage(store);
    storeTheme('light');
    expect(store[THEME_STORAGE_KEY]).toBe('light');
  });

  it('swallows a storage failure', () => {
    stubStorage({}, { throws: true });
    expect(() => storeTheme('dark')).not.toThrow();
  });
});

describe('getSystemTheme', () => {
  it('reads dark from the media query', () => {
    stubMatchMedia(true);
    expect(getSystemTheme()).toBe('dark');
  });

  it('reads light from the media query', () => {
    stubMatchMedia(false);
    expect(getSystemTheme()).toBe('light');
  });
});
