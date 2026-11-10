import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetOfflineCopies, offlineCacheKey } from './useOfflineCache';
import { announceAccountChanged, isAccountPart } from './account-events';

/**
 * The offline copies of boards a browser keeps, one IndexedDB database per
 * account and board, and what is wiped when someone signs out: theirs, all of
 * them, and nobody else's.
 */

interface FakeRequest {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
}

function fakeIndexedDb(
  names: string[],
  answer: (request: FakeRequest) => void = (r) => r.onsuccess?.(),
) {
  const deleted: string[] = [];
  vi.stubGlobal('indexedDB', {
    databases: async () => names.map((name) => ({ name, version: 1 })),
    deleteDatabase: (name: string) => {
      deleted.push(name);
      const request: FakeRequest = { onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => answer(request));
      return request;
    },
  });
  return deleted;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('offline copies', () => {
  it('are named by account and board', () => {
    expect(offlineCacheKey('user-1', 'board-1')).toBe('canvasflow:user-1:board-1');
  });

  it('are all forgotten for the account signing out, and only for it', async () => {
    const deleted = fakeIndexedDb([
      offlineCacheKey('user-1', 'board-1'),
      offlineCacheKey('user-1', 'board-2'),
      offlineCacheKey('user-10', 'board-3'),
      offlineCacheKey('user-2', 'board-1'),
      'some-other-database',
    ]);
    await forgetOfflineCopies('user-1');
    expect(deleted.sort()).toEqual([
      offlineCacheKey('user-1', 'board-1'),
      offlineCacheKey('user-1', 'board-2'),
    ]);
  });

  it('carries on when a deletion is refused or blocked by another tab', async () => {
    let answered = 0;
    const deleted = fakeIndexedDb(
      [offlineCacheKey('user-1', 'a'), offlineCacheKey('user-1', 'b')],
      (request) => {
        answered += 1;
        if (answered === 1) request.onerror?.();
        else request.onblocked?.();
      },
    );
    await forgetOfflineCopies('user-1');
    expect(deleted).toHaveLength(2);
  });

  it('gives up after two seconds rather than hold up signing out', async () => {
    vi.useFakeTimers();
    fakeIndexedDb([offlineCacheKey('user-1', 'a')], () => {
      // Never answers.
    });
    let done = false;
    const forgetting = forgetOfflineCopies('user-1').then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await forgetting;
    expect(done).toBe(true);
  });

  it('does nothing where the browser cannot list its databases', async () => {
    vi.stubGlobal('indexedDB', {});
    await expect(forgetOfflineCopies('user-1')).resolves.toBeUndefined();
    vi.unstubAllGlobals();
    await expect(forgetOfflineCopies('user-1')).resolves.toBeUndefined();
  });
});

describe('account changes from the server', () => {
  it('name only the parts the editor knows how to refresh', () => {
    expect(isAccountPart('notifications')).toBe(true);
    expect(isAccountPart('billing')).toBe(false);
    expect(isAccountPart(undefined)).toBe(false);
    // With nobody listening, an announcement is simply dropped.
    expect(() => announceAccountChanged('notifications')).not.toThrow();
  });
});
