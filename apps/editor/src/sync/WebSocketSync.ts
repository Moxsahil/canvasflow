import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import type { BoardDocument } from '@canvasflow/canvas-engine';
import type { SyncStatus } from './BoardSync';

export interface WebSocketSyncConfig {
  boardId: string;
  syncUrl: string;
  apiUrl: string;
  getToken: () => string | null;
  onAuthError?: () => void;
  onStatusChange?: (status: SyncStatus) => void;
}

/**
 * WebSocket sync layer, wrapping Hocuspocus provider with our resilience:
 *   - Infinite exponential backoff (never gives up on the connection)
 *   - Visibility API: force reconnect when user returns to a hidden tab
 *   - Warm-up ping: HTTP GET on api-gateway when user resumes after long idle,
 *     so cold serverless backends wake before the WebSocket tries to connect
 *
 * Reads and writes Yjs updates. Persistence to Postgres happens on the
 * server side via sync-server's onStoreDocument hook — this layer just
 * has to keep the connection alive.
 */
export class WebSocketSync {
  private provider: HocuspocusProvider | null = null;
  private disposed = false;
  /**
   * Last status reported by Hocuspocus. Tracked here because the socket's
   * `status` lives on the internal websocketProvider, not on the provider
   * itself — mirroring it keeps us off that internal.
   */
  private wsStatus: WebSocketStatus = WebSocketStatus.Connecting;
  private lastActivityAt = Date.now();
  private visibilityHandler: (() => void) | null = null;

  /** Threshold for "long idle" before firing a warm-up ping. */
  private static readonly WARM_UP_IDLE_MS = 30_000;

  /** After this many consecutive failed reconnect attempts, we call it offline. */
  private static readonly OFFLINE_THRESHOLD = 5;

  /** Consecutive failed reconnect attempts since last successful connect. */
  private consecutiveFailures = 0;

  constructor(
    private readonly doc: BoardDocument,
    private readonly config: WebSocketSyncConfig,
  ) {
    this.connect();
    this.installVisibilityListener();
  }

  private connect(): void {
    if (this.disposed) return;

    this.config.onStatusChange?.('connecting');

    this.provider = new HocuspocusProvider({
      url: this.config.syncUrl,
      name: this.config.boardId,
      document: this.doc.yDoc,
      // Hocuspocus's token callback must resolve to a string. An empty string
      // is rejected by sync-server's onAuthenticate, which surfaces as
      // onAuthenticationFailed below — the same path as an expired token.
      token: () => this.config.getToken() ?? '',
      // Hocuspocus defaults: initial 1s, doubles up to 30s
      onStatus: ({ status }) => this.handleStatusChange(status),
      onAuthenticationFailed: () => {
        // Editor's useBoardSync handles this by calling refresh on useAuthToken
        this.config.onAuthError?.();
      },
    });
  }

  /**
   * Translate Hocuspocus's status vocabulary into our SyncStatus enum,
   * so BoardSync + ZoomPanel see a unified status regardless of transport.
   */
  private handleStatusChange(status: WebSocketStatus): void {
    if (this.disposed) return;

    switch (status) {
      case WebSocketStatus.Connecting:
        this.config.onStatusChange?.('connecting');
        break;

      case WebSocketStatus.Connected:
        // Successful connect — reset the failure counter and clear
        // any 'offline' state.
        this.consecutiveFailures = 0;
        this.config.onStatusChange?.('connected');
        break;

      case WebSocketStatus.Disconnected:
        // Each disconnect increments the counter. Below the threshold we
        // stay in 'reconnecting' (transient blip). At or above, we're
        // realistically offline — user's WiFi is off, or the server is
        // genuinely unreachable. Distinguishing the two is real UX value:
        // "Reconnecting..." for a few seconds is fine; users need to know
        // when we've stopped succeeding.
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= WebSocketSync.OFFLINE_THRESHOLD) {
          this.config.onStatusChange?.('offline');
        } else {
          this.config.onStatusChange?.('reconnecting');
        }
        break;

      default:
        this.config.onStatusChange?.('error');
    }
  }

  private forceReconnect(): void {
    if (this.disposed) return;
    if (!this.provider) return;
    if (this.wsStatus === WebSocketStatus.Connected) return;

    this.provider.connect();
  }

  notifyActivity(): void {
    if (this.disposed) return;
    const now = Date.now();
    const idleFor = now - this.lastActivityAt;
    this.lastActivityAt = now;

    if (idleFor > WebSocketSync.WARM_UP_IDLE_MS) {
      // Fire and forget — we don't care about the response
      fetch(`${this.config.apiUrl}/health`, { method: 'GET' }).catch(() => {
        // Ignore; the ping is opportunistic
      });

      this.forceReconnect();
    }
  }

  private installVisibilityListener(): void {
    if (typeof document === 'undefined') return;
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.forceReconnect();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  dispose(): void {
    this.disposed = true;
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
  }
}
