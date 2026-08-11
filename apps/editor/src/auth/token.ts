export function getAuthTokenFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  return params.get('token');
}

export function clearAuthTokenFromHash(): void {
  if (typeof window === 'undefined') return;
  const cleanUrl = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', cleanUrl);
}

/**
 * Reads the `exp` claim (seconds since epoch) out of a JWT without
 * verifying its signature — fine here since it's only used to schedule
 * a refresh, not to establish trust. The server re-validates on every call.
 */
export function decodeJwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const claims = JSON.parse(json) as { exp?: number };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Reads the `boardId` claim out of a JWT without verifying the signature.
 * Used to double-check that a token loaded from sessionStorage matches
 * the board being viewed — if a user navigates to a different board's
 * URL, we must not reuse a token scoped to the previous board.
 */
export function decodeJwtBoardId(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const claims = JSON.parse(json) as { boardId?: string };
    return typeof claims.boardId === 'string' ? claims.boardId : null;
  } catch {
    return null;
  }
}

export function decodeJwtUserId(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const claims = JSON.parse(json) as { id?: string };
    return typeof claims.id === 'string' ? claims.id : null;
  } catch {
    return null;
  }
}

export interface RefreshedToken {
  token: string;
  expiresAt: number;
  boardId: string;
}

/**
 * Silently mints a fresh editor token, scoped to a specific board, by
 * calling back to the web app with the user's session cookie (cross-origin,
 * credentialed — the web app's /api/editor-token route allows this origin
 * via CORS).
 *
 * The board scoping means each token authorizes access to exactly one
 * board. Attempting to use a board-A token against board B is rejected
 * by the sync-server. If the user has lost access to the board, this
 * request returns 404 and refreshing will fail — matching the intended
 * revocation semantics.
 */
export async function refreshAuthToken(webUrl: string, boardId: string): Promise<RefreshedToken> {
  const url = new URL('/api/editor-token', webUrl);
  url.searchParams.set('boardId', boardId);

  const res = await fetch(url.toString(), { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    token: string;
    expiresAt: number;
    boardId: string;
  };
  return json;
}
