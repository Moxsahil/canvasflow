import type { Peer, PresenceActivity, PresenceState } from '@canvasflow/canvas-engine';

/** One row in the peer bar. Deduplicated by user, unlike {@link Peer}. */
export interface RosterEntry {
  readonly userId: string;
  readonly name: string;
  readonly activity: PresenceActivity;
  readonly isLocal: boolean;
}

/** Ranked so that merging a user's tabs keeps the liveliest of them. */
const ACTIVITY_RANK: Record<PresenceActivity, number> = { active: 0, idle: 1, away: 2 };

/**
 * Collapse connections into people.
 *
 * Awareness is keyed by connection, not by account, so one person with the
 * board open in two tabs arrives as two clients. Both of their cursors are real
 * and both get drawn — but the peer bar is a list of people, and the same face
 * appearing twice reads as a bug rather than as information.
 *
 * The local user is always first, so their row doesn't move as others join.
 */
export function buildRoster(peers: readonly Peer[], local: PresenceState | null): RosterEntry[] {
  const byUser = new Map<string, RosterEntry>();

  if (local) {
    byUser.set(local.user.id, {
      userId: local.user.id,
      name: local.user.name,
      activity: local.activity,
      isLocal: true,
    });
  }

  for (const peer of peers) {
    const existing = byUser.get(peer.user.id);
    if (existing) {
      // A second tab that is active should not be reported as idle just
      // because the first one went quiet.
      if (ACTIVITY_RANK[peer.activity] < ACTIVITY_RANK[existing.activity]) {
        byUser.set(peer.user.id, { ...existing, activity: peer.activity });
      }
      continue;
    }
    byUser.set(peer.user.id, {
      userId: peer.user.id,
      name: peer.user.name,
      activity: peer.activity,
      isLocal: false,
    });
  }

  return [...byUser.values()];
}

/**
 * Compares only what the peer bar actually draws.
 *
 * This is the guard that keeps cursor traffic out of React. Awareness fires a
 * change event on every remote pointer move; without this every one of them
 * would set state and re-render the editor.
 */
export function rosterEquals(a: readonly RosterEntry[], b: readonly RosterEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index]!;
    return (
      entry.userId === other.userId &&
      entry.name === other.name &&
      entry.activity === other.activity &&
      entry.isLocal === other.isLocal
    );
  });
}
