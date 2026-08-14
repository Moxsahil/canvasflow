import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardDocument } from '@canvasflow/canvas-engine';
import { BoardSync, type SyncStatus } from './BoardSync';
import { WebSocketSync } from './WebSocketSync';

interface UseBoardSyncOptions {
  boardId: string;
  apiUrl: string;
  syncUrl: string;
  authToken: string | null;
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
 *   - On mount: create BoardSync, HTTP-hydrate, then attach WebSocketSync
 *   - On board change: dispose everything, recreate for new board
 *   - On auth token change: recreate WebSocketSync (provider needs a new token)
 *   - On unmount: dispose both cleanly
 */
export function useBoardSync(
  doc: BoardDocument,
  { boardId, apiUrl, syncUrl, authToken, onAuthError }: UseBoardSyncOptions,
): UseBoardSyncResult {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocketSync | null>(null);
  const boardSyncRef = useRef<BoardSync | null>(null);
  const tokenRef = useRef<string | null>(authToken);
  // Held in a ref for the same reason as the token: the connection effect must
  // not tear down and reconnect just because the callback's identity changed.
  const onAuthErrorRef = useRef(onAuthError);

  useEffect(() => {
    tokenRef.current = authToken;
  }, [authToken]);

  useEffect(() => {
    onAuthErrorRef.current = onAuthError;
  }, [onAuthError]);

  useEffect(() => {
    if (!authToken) {
      setStatus('idle');
      return;
    }

    let cancelled = false;

    const handleError = (err: Error) => {
      if (cancelled) return;
      setError(err);
      if (err.message.includes('401')) onAuthErrorRef.current?.();
    };

    const boardSync = new BoardSync(doc, {
      boardId,
      apiUrl,
      authToken,
      onError: handleError,
    });
    boardSyncRef.current = boardSync;

    const unsubStatus = boardSync.onStatusChange(setStatus);

    // HTTP hydration first, then attach WebSocket.
    boardSync
      .load()
      .then(() => {
        if (cancelled) return;
        const ws = new WebSocketSync(doc, {
          boardId,
          syncUrl,
          apiUrl,
          getToken: () => tokenRef.current,
          onAuthError: () => onAuthErrorRef.current?.(),
          onStatusChange: (nextStatus) => {
            if (cancelled) return;
            boardSync.setStatus(nextStatus);
          },
        });
        wsRef.current = ws;
      })
      .catch((err) => {
        handleError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      cancelled = true;
      unsubStatus();
      if (wsRef.current) {
        wsRef.current.dispose();
        wsRef.current = null;
      }
      boardSync.dispose();
      boardSyncRef.current = null;
    };
  }, [doc, boardId, apiUrl, syncUrl, authToken]);

  const notifyActivity = useCallback(() => {
    wsRef.current?.notifyActivity();
  }, []);

  return { status, error, notifyActivity };
}
