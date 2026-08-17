import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardDocument } from '@canvasflow/canvas-engine';
import type { SyncStatus } from './sync-status';
import { WebSocketSync } from './WebSocketSync';
import { useOfflineCache } from './useOfflineCache';

interface UseBoardSyncOptions {
  boardId: string;
  apiUrl: string;
  syncUrl: string;
  authToken: string | null;
  userId: string | null;
  onAuthError?: () => void;
}

interface UseBoardSyncResult {
  status: SyncStatus;
  error: Error | null;
  notifyActivity: () => void;
}

/**
 * Wires a BoardDocument to the sync layer.
 *
 * Lifecycle:
 *   - On mount: replay the local cache, attach WebSocketSync
 *   - On board change: dispose everything, recreate for new board
 *   - On auth token change: nothing — see the connection effect below
 *   - On unmount: dispose cleanly
 *
 * There is no HTTP hydration step. The server's state arrives through the
 * WebSocket's own sync protocol, so fetching it separately meant loading
 * the same bytes twice and, worse, holding the socket closed until the
 * slower of the two finished.
 */
export function useBoardSync(
  doc: BoardDocument,
  { boardId, apiUrl, syncUrl, authToken, userId, onAuthError }: UseBoardSyncOptions,
): UseBoardSyncResult {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocketSync | null>(null);

  // The token is deliberately read through a ref rather than closed over.
  // Editor tokens live ~5 minutes and are silently re-minted a minute
  // before expiry, so treating the token as a dependency of the connection
  // effect tore the socket down and rebuilt it every few minutes — for a
  // board that was already loaded and already live. WebSocketSync asks for
  // the current token via getToken() whenever it actually needs one.
  const tokenRef = useRef<string | null>(authToken);
  // Held in a ref for the same reason: the connection must not restart
  // just because a callback's identity changed between renders.
  const onAuthErrorRef = useRef(onAuthError);

  const cacheHydrated = useOfflineCache(doc, boardId, userId);

  useEffect(() => {
    tokenRef.current = authToken;
  }, [authToken]);

  useEffect(() => {
    onAuthErrorRef.current = onAuthError;
  }, [onAuthError]);

  const hasToken = authToken !== null;

  useEffect(() => {
    if (!hasToken) {
      setStatus('idle');
      return;
    }

    // Attaching the provider before the cache has replayed would let the
    // server's state land first and make the local copy look like a remote
    // edit. Both orders converge — Yjs updates are commutative — but
    // waiting keeps the local doc authoritative for first paint, which is
    // the whole point of caching it.
    if (!cacheHydrated) {
      setStatus('loading');
      return;
    }

    let cancelled = false;

    const ws = new WebSocketSync(doc, {
      boardId,
      syncUrl,
      apiUrl,
      getToken: () => tokenRef.current,
      onAuthError: () => onAuthErrorRef.current?.(),
      onStatusChange: (next) => {
        if (cancelled) return;
        setStatus(next);
      },
      onError: (err) => {
        if (cancelled) return;
        setError(err);
      },
    });
    wsRef.current = ws;

    return () => {
      cancelled = true;
      ws.dispose();
      wsRef.current = null;
    };
  }, [doc, boardId, apiUrl, syncUrl, hasToken, cacheHydrated]);

  const notifyActivity = useCallback(() => {
    wsRef.current?.notifyActivity();
  }, []);

  return { status, error, notifyActivity };
}
