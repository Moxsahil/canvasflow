import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasAccountSession } from './session';

afterEach(() => vi.unstubAllGlobals());

describe('public app entry session check', () => {
  const api = 'https://api.example.test';
  const signal = new AbortController().signal;

  it('recognizes an authenticated account using cookies without caching its profile', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: { id: 'account', isGuest: false } })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await hasAccountSession(`${api}/`, signal)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${api}/users/me`, {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
  });

  it.each([401, 403, 500])(
    'keeps the public page available after a %s response',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
      expect(await hasAccountSession(api, signal)).toBe(false);
    },
  );

  it.each([
    {},
    { data: {} },
    { data: { id: 'guest', isGuest: true } },
    { data: { id: '', isGuest: false } },
  ])('does not treat a guest or malformed profile as an account: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    expect(await hasAccountSession(api, signal)).toBe(false);
  });

  it('keeps the public page available when the gateway is unreachable or the request is aborted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    expect(await hasAccountSession(api, signal)).toBe(false);
  });
});
