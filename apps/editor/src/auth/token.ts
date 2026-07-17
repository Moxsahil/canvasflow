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

export interface RefreshedToken {
  token: string;
  expiresAt: number;
}

/**
 * Silently mints a fresh editor token by calling back to the web app
 * with the user's session cookie (cross-origin, credentialed — the web
 * app's /api/editor-token route allows this origin via CORS).
 */
export async function refreshAuthToken(webUrl: string): Promise<RefreshedToken> {
  const res = await fetch(`${webUrl}/api/editor-token`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }
  const json = (await res.json()) as { token: string; expiresAt: number };
  return json;
}
