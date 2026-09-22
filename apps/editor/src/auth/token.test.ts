import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenRefreshError, refreshAuthToken } from './token';

const BOARD = '7985f127-353b-4960-9fa4-147379f2ab83';
const GATEWAY = 'http://localhost:3001/auth/editor-token';
const WEB = 'http://localhost:3000/api/editor-token';

/** An unsigned token carrying the one claim the routing reads. */
function tokenFor(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`;
}

const minted = { token: 'next', expiresAt: 1, boardId: BOARD };

function respond(status: number) {
  return new Response(status === 200 ? JSON.stringify(minted) : '{}', { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Which endpoint each call went to, without the query string. */
function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url).split('?')[0]!);
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshAuthToken', () => {
  it('asks the gateway for an account, and nothing else', async () => {
    fetchMock.mockResolvedValueOnce(respond(200));

    await expect(refreshAuthToken(BOARD, tokenFor({ isGuest: false }))).resolves.toEqual(minted);
    expect(calledPaths()).toEqual([GATEWAY]);
  });

  it('asks the web app for a guest, whose cookie never reaches the gateway', async () => {
    fetchMock.mockResolvedValueOnce(respond(200));

    await refreshAuthToken(BOARD, tokenFor({ isGuest: true }));
    expect(calledPaths()).toEqual([WEB]);
  });

  it('tries the gateway first when there is no token to go on', async () => {
    fetchMock.mockResolvedValueOnce(respond(200));

    await refreshAuthToken(BOARD, null);
    expect(calledPaths()).toEqual([GATEWAY]);
  });

  it('falls through to the guest route when an unknown visitor has no account session', async () => {
    fetchMock.mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(200));

    await expect(refreshAuthToken(BOARD, null)).resolves.toEqual(minted);
    expect(calledPaths()).toEqual([GATEWAY, WEB]);
  });

  it('does not fall through for a known account — a 401 there means the session is over', async () => {
    fetchMock.mockResolvedValueOnce(respond(401));

    await expect(refreshAuthToken(BOARD, tokenFor({ isGuest: false }))).rejects.toMatchObject({
      status: 401,
    });
    expect(calledPaths()).toEqual([GATEWAY]);
  });

  it('does not fall through on a 404 — the board is not theirs from either side', async () => {
    fetchMock.mockResolvedValueOnce(respond(404));

    const error = await refreshAuthToken(BOARD, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TokenRefreshError);
    expect((error as TokenRefreshError).accessDenied).toBe(true);
    expect(calledPaths()).toEqual([GATEWAY]);
  });

  it('sends cookies on every request, which is how the session travels', async () => {
    fetchMock.mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(200));

    await refreshAuthToken(BOARD, null);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).credentials).toBe('include');
    }
  });

  it('scopes the request to the board', async () => {
    fetchMock.mockResolvedValueOnce(respond(200));

    await refreshAuthToken(BOARD, tokenFor({ isGuest: false }));
    expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get('boardId')).toBe(BOARD);
  });
});
