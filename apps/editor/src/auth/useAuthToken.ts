import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '@/lib/env';
import {
  clearAuthTokenFromHash,
  decodeJwtExpiry,
  getAuthTokenFromHash,
  refreshAuthToken,
} from './token';

const STORAGE_KEY = 'editor:authToken';
// Refresh a little before actual expiry so in-flight sync calls don't
// race the token going stale.
const REFRESH_MARGIN_MS = 60_000;
// Guard against hammering the web app if refreshes keep failing (e.g.
// the user's web session itself expired) — several BoardSync flushes
// can all report a 401 in quick succession.
const MIN_REFRESH_INTERVAL_MS = 5_000;

interface AuthTokenState {
  token: string | null;
  expiresAt: number | null;
}

function readInitialToken(): AuthTokenState {
  const fromHash = getAuthTokenFromHash();
  if (fromHash) {
    window.sessionStorage.setItem(STORAGE_KEY, fromHash);
    clearAuthTokenFromHash();
    return { token: fromHash, expiresAt: decodeJwtExpiry(fromHash) };
  }
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  return { token: stored, expiresAt: stored ? decodeJwtExpiry(stored) : null };
}

/**
 * Owns the editor's auth token for its whole lifetime: picks it up from
 * the URL hash (or sessionStorage on refresh), then keeps it fresh by
 * silently re-minting it from the web app shortly before it expires —
 * so long editing sessions don't run into a dead "sync error" once the
 * initial 10-minute token lapses.
 */
export function useAuthToken(): { authToken: string | null; refresh: () => Promise<void> } {
  const [state, setState] = useState<AuthTokenState>(readInitialToken);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAttemptRef = useRef(0);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastAttemptRef.current < MIN_REFRESH_INTERVAL_MS) return;
    lastAttemptRef.current = now;

    try {
      const next = await refreshAuthToken(env.VITE_WEB_URL);
      window.sessionStorage.setItem(STORAGE_KEY, next.token);
      setState({ token: next.token, expiresAt: next.expiresAt });
    } catch (err) {
      console.error('Failed to refresh editor auth token:', err);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!state.expiresAt) return undefined;

    const delay = Math.max(state.expiresAt - Date.now() - REFRESH_MARGIN_MS, 0);
    timerRef.current = setTimeout(() => {
      void refresh();
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.expiresAt, refresh]);

  return { authToken: state.token, refresh };
}
