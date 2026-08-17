/**
 * Unified sync state, so the UI reports one thing regardless of which
 * layer is currently doing the work.
 *
 *   - idle:         no sync attempted yet (no auth token)
 *   - loading:      restoring the board from the local cache
 *   - connecting:   WebSocket handshake in progress
 *   - connected:    WebSocket connected, real-time sync live
 *   - reconnecting: WebSocket dropped, retrying with backoff
 *   - offline:      no successful WebSocket connection recently
 *   - error:        terminal error (unlikely — reconnect never gives up)
 *
 * `loading` used to mean an HTTP hydration round trip that had to finish
 * before the socket could open. That path is gone: the server's state now
 * arrives over the WebSocket itself, and `loading` covers only the brief
 * local-cache replay that precedes it.
 */
export type SyncStatus =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'error';
