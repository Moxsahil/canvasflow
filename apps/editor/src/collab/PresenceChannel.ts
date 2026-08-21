import { parsePresenceState, type Peer, type PresenceState } from '@canvasflow/canvas-engine';
import type { SyncAwareness } from '../sync/WebSocketSync';

/**
 * The transport for presence.
 *
 * Wraps the Yjs awareness channel, which is per-client, expires a client's
 * entry when it disconnects, and never enters the Y.Doc. That last part is the
 * whole reason presence is separate: cursor updates arrive at pointer rate, and
 * in the document each one would become a persisted update — a row in
 * `board_updates` for every mouse move.
 *
 * Deliberately not a React hook. Peers change far too often to route through
 * render, so this exposes a snapshot plus a subscription and lets each consumer
 * decide whether it wants to re-render or just repaint.
 */

/** The key our record lives under inside the awareness state object. */
const PRESENCE_KEY = 'presence';

export type PeerListener = (peers: readonly Peer[]) => void;

export class PresenceChannel {
  private readonly awareness: SyncAwareness;
  private readonly listeners = new Set<PeerListener>();
  private peers: readonly Peer[] = [];
  private local: PresenceState | null = null;
  private disposed = false;

  constructor(awareness: SyncAwareness) {
    this.awareness = awareness;
    this.awareness.on('change', this.handleChange);
    this.handleChange();
  }

  /** Everyone except us, most recently parsed. */
  getPeers(): readonly Peer[] {
    return this.peers;
  }

  /** What we last published. */
  getLocal(): PresenceState | null {
    return this.local;
  }

  subscribe(listener: PeerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Replace the local record wholesale. */
  publish(state: PresenceState): void {
    if (this.disposed) return;
    this.local = state;
    this.awareness.setLocalStateField(PRESENCE_KEY, state);
  }

  /**
   * Update part of the local record.
   *
   * Returns silently when nothing has been published yet: identity arrives with
   * the connection, and a cursor move before that has nothing to attach to.
   */
  patch(patch: Partial<PresenceState>): void {
    if (!this.local) return;
    this.publish({ ...this.local, ...patch, lastActive: Date.now() });
  }

  /** Who, if anyone, is currently following us. */
  followersOf(userId: string): readonly Peer[] {
    return this.peers.filter((peer) => peer.following === userId);
  }

  /** The freshest record for a given user, across all their connections. */
  findByUser(userId: string): Peer | null {
    let best: Peer | null = null;
    for (const peer of this.peers) {
      if (peer.user.id !== userId) continue;
      if (!best || peer.lastActive > best.lastActive) best = peer;
    }
    return best;
  }

  dispose(): void {
    this.disposed = true;
    this.awareness.off('change', this.handleChange);
    this.listeners.clear();
    // Clearing on the way out is what makes a clean disconnect immediate.
    // Without it, peers keep drawing us until the awareness timeout fires
    // roughly thirty seconds later.
    this.awareness.setLocalState(null);
  }

  private handleChange = (): void => {
    if (this.disposed) return;

    const next: Peer[] = [];
    for (const [clientId, raw] of this.awareness.getStates()) {
      if (clientId === this.awareness.clientID) continue;
      // Peer-authored data crosses a trust boundary here.
      const parsed = parsePresenceState(
        (raw as Record<string, unknown> | undefined)?.[PRESENCE_KEY],
      );
      if (parsed) next.push({ ...parsed, clientId });
    }

    this.peers = next;
    for (const listener of this.listeners) listener(next);
  };
}
