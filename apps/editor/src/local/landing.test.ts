import { afterEach, describe, expect, it, vi } from 'vitest';
import { findLandingBoard } from './landing';

function answer(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('asking where a signed-in account starts', () => {
  it('names the board for an account that is signed in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(200, { boardId: 'b1' })),
    );
    await expect(findLandingBoard()).resolves.toEqual({ status: 'signed-in', boardId: 'b1' });
  });

  it('asks once for everyone asking at the same time', async () => {
    const fetch = vi.fn(async () => answer(200, { boardId: 'b1' }));
    vi.stubGlobal('fetch', fetch);
    const [a, b] = await Promise.all([findLandingBoard(), findLandingBoard()]);
    expect(a).toEqual(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks once more after a 401, which a renewal race can give a signed-in account', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(answer(401))
      .mockResolvedValueOnce(answer(200, { boardId: 'b2' }));
    vi.stubGlobal('fetch', fetch);
    const found = findLandingBoard();
    await vi.advanceTimersByTimeAsync(600);
    await expect(found).resolves.toEqual({ status: 'signed-in', boardId: 'b2' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('is signed out when asked twice and refused twice', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(401)),
    );
    const found = findLandingBoard();
    await vi.advanceTimersByTimeAsync(600);
    await expect(found).resolves.toEqual({ status: 'signed-out' });
  });

  it('does not know when the gateway cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    await expect(findLandingBoard()).resolves.toEqual({ status: 'unknown' });
  });
});
