import { describe, expect, it } from 'vitest';
import { forgetDismissalsByEmail, rememberDismissed, wasDismissed } from './verification-dismissal';

/** A Storage that keeps its items in a Map. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  };
}

describe('verification dismissal', () => {
  it('remembers a dismissal by account id, not by email', () => {
    const store = fakeStorage();
    rememberDismissed('f15766eb-58bf-4556-8ca9-3d5a01fd3903', store);
    expect(store.key(0)).toBe('cf:verify-dismissed:f15766eb-58bf-4556-8ca9-3d5a01fd3903');
    expect(wasDismissed('f15766eb-58bf-4556-8ca9-3d5a01fd3903', store)).toBe(true);
    expect(wasDismissed('another-account', store)).toBe(false);
  });

  it('removes the markers named by email, and nothing else', () => {
    const store = fakeStorage({
      'cf:verify-dismissed:ada@example.com': '1',
      'cf:verify-dismissed:grace@example.com': '1',
      'cf:verify-dismissed:f15766eb-58bf-4556-8ca9-3d5a01fd3903': '1',
      'cf:theme': 'dark',
    });
    forgetDismissalsByEmail(store);
    expect([...Array(store.length).keys()].map((i) => store.key(i)).sort()).toEqual([
      'cf:theme',
      'cf:verify-dismissed:f15766eb-58bf-4556-8ca9-3d5a01fd3903',
    ]);
  });

  it('treats storage that throws as nothing remembered', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(wasDismissed('u', broken)).toBe(false);
    expect(() => rememberDismissed('u', broken)).not.toThrow();
    expect(() => forgetDismissalsByEmail(broken)).not.toThrow();
  });
});
