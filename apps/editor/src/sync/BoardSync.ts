import * as Y from 'yjs';
import type { BoardDocument } from '@canvasflow/canvas-engine';

export interface BoardSyncConfig {
  boardId: string;
  apiUrl: string;
  authToken: string;
  /** Debounce window in ms before batching updates and sending. */
  saveDebounceMs?: number;
  /** Called whenever load() or a debounced flush() fails. */
  onError?: (err: Error) => void;
}

export type SyncStatus = 'idle' | 'loading' | 'loaded' | 'saving' | 'saved' | 'error';

/**
 * Bidirectional sync between a BoardDocument and the api-gateway.
 *
 * On load: fetches the update log from the server, applies each update
 * to the Y.Doc in order. This reconstructs the document state.
 *
 * On change: batches subsequent updates into 2-second windows, then
 * POSTs a merged update to the server. The batching approach means
 * one user drawing a shape produces one network call, not one per
 * mouse move.
 */
export class BoardSync {
  private status: SyncStatus = 'idle';
  private statusListeners = new Set<(status: SyncStatus) => void>();

  private pendingUpdates: Uint8Array[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private unobserve: (() => void) | null = null;

  constructor(
    private doc: BoardDocument,
    private config: BoardSyncConfig,
  ) {}

  getStatus(): SyncStatus {
    return this.status;
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(next: SyncStatus): void {
    this.status = next;
    for (const listener of this.statusListeners) listener(next);
  }

  /**
   * Hydrate the doc from the server's update log. Call once on mount.
   */
  async load(): Promise<void> {
    if (this.disposed) return;
    this.setStatus('loading');

    try {
      const res = await fetch(`${this.config.apiUrl}/boards/${this.config.boardId}/updates`, {
        headers: { Authorization: `Bearer ${this.config.authToken}` },
      });

      if (!res.ok) {
        throw new Error(`Load failed: ${res.status}`);
      }

      const json = (await res.json()) as {
        data: { updates: string[]; totalUpdates: number };
      };

      // Apply each update in order (they're already sorted by createdAt)
      for (const base64Update of json.data.updates) {
        const bytes = base64ToBytes(base64Update);
        Y.applyUpdate(this.doc.yDoc, bytes);
      }

      // NOW start observing changes. We do this AFTER load to avoid
      // treating the load-time hydration as user changes to sync back.
      this.startObserving();

      this.setStatus('loaded');
    } catch (err) {
      console.error('BoardSync load failed:', err);
      this.setStatus('error');
      throw err;
    }
  }

  private startObserving(): void {
    // Y.Doc.on('update', ...) fires whenever ANY change happens to the doc.
    // The update parameter is the raw binary diff. Multiple mutations in
    // one transact() batch produce one update event.
    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      // Ignore updates that came from the server (applied via Y.applyUpdate
      // during load or future collab). We use a special origin symbol for
      // remote updates in Sprint 3; for now, all updates are local.
      if (origin === 'remote') return;

      this.pendingUpdates.push(update);
      this.scheduleSave();
    };

    this.doc.yDoc.on('update', handleUpdate);
    this.unobserve = () => this.doc.yDoc.off('update', handleUpdate);
  }

  private scheduleSave(): void {
    if (this.disposed) return;
    if (this.saveTimer) return; // already scheduled

    const debounceMs = this.config.saveDebounceMs ?? 2000;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch((err) => {
        console.error('BoardSync flush failed:', err);
        this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }, debounceMs);
  }

  /**
   * Force-flush all pending updates to the server immediately.
   * Called on debounce timer, on beforeunload, and can be called manually.
   */
  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.pendingUpdates.length === 0) return;

    const updatesToSend = this.pendingUpdates;
    this.pendingUpdates = [];
    this.setStatus('saving');

    // Merge all pending updates into one binary blob. Yjs's mergeUpdates
    // combines multiple updates into a single equivalent update, keeping
    // the server's update log smaller.
    const merged = Y.mergeUpdates(updatesToSend);
    const base64 = bytesToBase64(merged);

    try {
      const res = await fetch(`${this.config.apiUrl}/boards/${this.config.boardId}/updates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.authToken}`,
        },
        body: JSON.stringify({ update: base64 }),
      });

      if (!res.ok) {
        // On failure, restore pending updates so they get retried
        this.pendingUpdates.unshift(...updatesToSend);
        throw new Error(`Save failed: ${res.status}`);
      }

      this.setStatus('saved');
    } catch (err) {
      console.error('BoardSync flush error:', err);
      this.setStatus('error');
      throw err;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.unobserve) this.unobserve();
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.statusListeners.clear();
  }
}

// --- Base64 helpers ---
// Browsers have atob/btoa but they're string-based; we need bytes.

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
