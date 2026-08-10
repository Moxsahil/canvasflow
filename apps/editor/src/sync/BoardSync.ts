import * as Y from 'yjs';
import type { BoardDocument } from '@canvasflow/canvas-engine';

export interface BoardSyncConfig {
  boardId: string;
  apiUrl: string;
  authToken: string;
  onError?: (err: Error) => void;
}

/**
 *   - idle:        no sync attempted yet
 *   - loading:     HTTP hydration in progress (initial)
 *   - connecting:  WebSocket handshake in progress
 *   - connected:   WebSocket connected, real-time sync live
 *   - reconnecting: WebSocket dropped, retrying with backoff
 *   - offline:     no successful WebSocket connection recently
 *   - error:       terminal error (unlikely — reconnect never gives up)
 */
export type SyncStatus =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'error';

/**
 * Initial-load path for board content. Post-Sprint-3, this is a
 * one-shot HTTP hydration; live updates flow via WebSocketSync.
 *
 * Order matters: we MUST apply the persisted state to the Y.Doc BEFORE
 * the WebSocket provider attaches — otherwise the provider's initial
 * sync would race the HTTP hydration and produce either duplicated
 * updates or a truncated document.
 */
export class BoardSync {
  private status: SyncStatus = 'idle';
  private statusListeners = new Set<(status: SyncStatus) => void>();
  private disposed = false;

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

  setStatus(next: SyncStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) listener(next);
  }

  /**
   * Hydrate the doc from the server's update log via HTTP. Call once
   * on mount, BEFORE attaching the WebSocket provider.
   *
   * Applies updates with origin='remote' so the doc's update observer
   * doesn't attribute them to the local user.
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

      // Apply hydration with the 'remote' origin so update observers
      // recognize these as server-sourced state, not local user actions.
      this.doc.yDoc.transact(() => {
        for (const base64Update of json.data.updates) {
          const bytes = base64ToBytes(base64Update);
          Y.applyUpdate(this.doc.yDoc, bytes);
        }
      }, 'remote');
    } catch (err) {
      console.error('BoardSync load failed:', err);
      this.setStatus('error');
      throw err;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.statusListeners.clear();
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
