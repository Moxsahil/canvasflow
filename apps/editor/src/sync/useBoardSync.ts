import { useEffect, useRef, useState } from 'react';
import type { BoardDocument } from '@canvasflow/canvas-engine';
import { BoardSync, type SyncStatus } from './BoardSync';

interface UseBoardSyncOptions {
  boardId: string;
  apiUrl: string;
  authToken: string | null;
  /** Called when a sync request fails with 401 — the caller should mint a fresh token. */
  onAuthError?: () => void;
}

interface UseBoardSyncResult {
  status: SyncStatus;
  error: Error | null;
}

function isAuthError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('401');
}

/**
 * Wires a BoardDocument to the api-gateway sync layer.
 *
 * Lifecycle:
 *   - On mount: create BoardSync, call load(), start observing
 *   - On board change: dispose the old sync, create fresh one
 *   - On unmount: flush pending updates, then dispose
 *   - Also flush on beforeunload (browser close/refresh)
 */
export function useBoardSync(
  doc: BoardDocument,
  { boardId, apiUrl, authToken, onAuthError }: UseBoardSyncOptions,
): UseBoardSyncResult {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const syncRef = useRef<BoardSync | null>(null);

  useEffect(() => {
    if (!authToken) {
      setStatus('idle');
      return;
    }

    const handleError = (err: Error) => {
      setError(err);
      if (isAuthError(err)) onAuthError?.();
    };

    const sync = new BoardSync(doc, {
      boardId,
      apiUrl,
      authToken,
      onError: handleError,
    });
    syncRef.current = sync;

    const unsubStatus = sync.onStatusChange(setStatus);

    sync.load().catch((err) => {
      handleError(err instanceof Error ? err : new Error(String(err)));
    });

    // Flush on tab close / refresh
    const flushOnLeave = () => {
      sync.flush().catch(() => {
        // Best-effort on unload; can't do much if it fails
      });
    };
    window.addEventListener('beforeunload', flushOnLeave);

    return () => {
      window.removeEventListener('beforeunload', flushOnLeave);
      unsubStatus();
      // Fire-and-forget final flush, then dispose
      sync
        .flush()
        .catch(() => undefined)
        .finally(() => sync.dispose());
      syncRef.current = null;
    };
  }, [doc, boardId, apiUrl, authToken]);

  return { status, error };
}
