import { useEffect, useRef, useState } from 'react';
import type { Peer } from '@canvasflow/canvas-engine';
import type { PresenceChannel } from './PresenceChannel';

/**
 * One person on the board, however many tabs they have open.
 *
 * The transport keys by connection, not by account, so someone with the board
 * open twice arrives as two peers. Both cursors are real and both are drawn —
 * but a list of *people* showing the same face twice reads as a bug.
 */
export interface RosterEntry {
  readonly userId: string;
  readonly name: string;
  readonly activity: Peer['activity'];
  readonly isSelf: boolean;
}

export interface PeerPresence {
  /**
   * Every remote cursor, for the cursor layer. Deliberately a ref: this changes
   * at pointer rate, and routing it through React state would re-render the
   * editor tree tens of times a second to move an eleven-pixel arrow.
   */
  readonly peersRef: React.MutableRefObject<readonly Peer[]>;
  /** Fires whenever `peersRef` changes. */
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Who is here, for the avatar list. React state — but recomputed only when
   * the roster genuinely changes, never on cursor movement.
   */
  readonly roster: readonly RosterEntry[];
}

/** Ranked so merging a person's tabs keeps the liveliest of them. */
const ACTIVITY_RANK: Record<Peer['activity'], number> = { active: 0, idle: 1, away: 2 };

function buildRoster(
  peers: readonly Peer[],
  self: { id: string; name: string } | null,
  selfActivity: Peer['activity'],
): RosterEntry[] {
  const byUser = new Map<string, RosterEntry>();

  if (self) {
    byUser.set(self.id, {
      userId: self.id,
      name: self.name,
      activity: selfActivity,
      isSelf: true,
    });
  }

  for (const peer of peers) {
    const existing = byUser.get(peer.user.id);
    if (existing) {
      if (ACTIVITY_RANK[peer.activity] < ACTIVITY_RANK[existing.activity]) {
        byUser.set(peer.user.id, { ...existing, activity: peer.activity });
      }
      continue;
    }
    byUser.set(peer.user.id, {
      userId: peer.user.id,
      name: peer.user.name,
      activity: peer.activity,
      isSelf: false,
    });
  }

  return [...byUser.values()];
}

/**
 * Compares only what the avatar list actually draws.
 *
 * This is the guard that keeps cursor traffic out of React: the channel fires on
 * every remote pointer move, and without this each one would set state.
 */
function rosterEquals(a: readonly RosterEntry[], b: readonly RosterEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index]!;
    return (
      entry.userId === other.userId &&
      entry.name === other.name &&
      entry.activity === other.activity &&
      entry.isSelf === other.isSelf
    );
  });
}

interface UsePeerPresenceOptions {
  channel: PresenceChannel | null;
  self: { id: string; name: string } | null;
  selfActivity: Peer['activity'];
}

export function usePeerPresence({
  channel,
  self,
  selfActivity,
}: UsePeerPresenceOptions): PeerPresence {
  const peersRef = useRef<readonly Peer[]>([]);
  const listenersRef = useRef(new Set<() => void>());
  const [roster, setRoster] = useState<readonly RosterEntry[]>([]);

  useEffect(() => {
    if (!channel) {
      peersRef.current = [];
      setRoster([]);
      for (const listener of listenersRef.current) listener();
      return;
    }

    const apply = (peers: readonly Peer[]) => {
      peersRef.current = peers;
      for (const listener of listenersRef.current) listener();
      setRoster((previous) => {
        const built = buildRoster(peers, self, selfActivity);
        return rosterEquals(previous, built) ? previous : built;
      });
    };

    const unsubscribe = channel.subscribe(apply);
    apply(channel.getPeers());
    return unsubscribe;
  }, [channel, self, selfActivity]);

  const subscribeRef = useRef((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  });

  return { peersRef, subscribe: subscribeRef.current, roster };
}
