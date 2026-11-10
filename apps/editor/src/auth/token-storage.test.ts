import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authTokenStorageKey,
  clearAuthTokenFromHash,
  clearStoredAuthTokens,
  decodeJwtBoardId,
  decodeJwtExpiry,
  decodeJwtWorkspaceId,
  getAuthTokenFromHash,
  sessionResumeUrl,
} from './token';
import { signOutTo } from './sign-out';

/**
 * Where the editor keeps board tokens and how it lets go of them: the URL
 * fragment a token arrives in, the per-board copies in sessionStorage, and
 * sign-out, which must leave none behind.
 */

/** sessionStorage, with nothing but what each test puts in it. */
function fakeSessionStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

/** A token's middle part, base64url like a real one. */
function tokenFor(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stored board tokens', () => {
  it('are all removed together, and nothing else is', () => {
    const storage = fakeSessionStorage({
      [authTokenStorageKey('board-a')]: 'a',
      [authTokenStorageKey('board-b')]: 'b',
      'editor:other-setting': 'kept',
      theme: 'dark',
    });
    vi.stubGlobal('window', { sessionStorage: storage });

    clearStoredAuthTokens();
    expect([...storage.map.keys()].sort()).toEqual(['editor:other-setting', 'theme']);
  });
});

describe('a token in the address', () => {
  it('is read from the fragment, and only from there', () => {
    vi.stubGlobal('window', { location: { hash: '#token=abc.def.ghi&x=1' } });
    expect(getAuthTokenFromHash()).toBe('abc.def.ghi');

    vi.stubGlobal('window', { location: { hash: '' } });
    expect(getAuthTokenFromHash()).toBeNull();

    vi.stubGlobal('window', { location: { hash: '#other=1' } });
    expect(getAuthTokenFromHash()).toBeNull();
  });

  it('is cleared without leaving a history entry that still holds it', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/boards/b1', search: '?shapes=s1', hash: '#token=secret' },
      history: { replaceState },
    });
    clearAuthTokenFromHash();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/boards/b1?shapes=s1');
  });

  it('is left alone outside a browser', () => {
    expect(getAuthTokenFromHash()).toBeNull();
    expect(() => clearAuthTokenFromHash()).not.toThrow();
  });
});

describe('reading a token', () => {
  it('gives its expiry in milliseconds, its board and its workspace', () => {
    const token = tokenFor({ exp: 1_800_000_000, boardId: 'b1', workspaceId: 'w1' });
    expect(decodeJwtExpiry(token)).toBe(1_800_000_000_000);
    expect(decodeJwtBoardId(token)).toBe('b1');
    expect(decodeJwtWorkspaceId(token)).toBe('w1');
  });

  it('reads base64url payloads, including the characters plain base64 lacks', () => {
    // A name chosen so the payload's encoding contains `-` or `_`.
    const token = tokenFor({ boardId: 'b1', name: '>>>???~~~' });
    expect(token.split('.')[1]).toMatch(/[-_]/);
    expect(decodeJwtBoardId(token)).toBe('b1');
  });

  it('gives null for anything that is not a token, or lacks the claim', () => {
    for (const bad of ['', 'nope', 'a.!!!.c', `${tokenFor({})}`]) {
      expect(decodeJwtExpiry(bad)).toBeNull();
      expect(decodeJwtBoardId(bad)).toBeNull();
      expect(decodeJwtWorkspaceId(bad)).toBeNull();
    }
    expect(decodeJwtBoardId(tokenFor({ boardId: 42 }))).toBeNull();
  });
});

describe('when a session has ended', () => {
  it('sends the browser to the gateway to resume, back to /open', () => {
    const url = new URL(sessionResumeUrl());
    expect(url.origin + url.pathname).toBe('http://localhost:3001/auth/resume');
    expect(url.searchParams.get('next')).toBe('/open');
  });
});

describe('signing out', () => {
  it('forgets every board token, then posts to the web app’s sign-out', () => {
    const storage = fakeSessionStorage({ [authTokenStorageKey('board-a')]: 'a' });
    const form = { method: '', action: '', hidden: false, submit: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal('window', { sessionStorage: storage });
    vi.stubGlobal('document', { createElement: vi.fn(() => form), body: { appendChild } });

    signOutTo('http://localhost:3000');

    expect(storage.map.size).toBe(0);
    expect(form).toMatchObject({
      method: 'POST',
      action: 'http://localhost:3000/logout',
      hidden: true,
    });
    expect(appendChild).toHaveBeenCalledWith(form);
    expect(form.submit).toHaveBeenCalledTimes(1);
  });
});
