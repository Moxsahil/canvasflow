import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  parsePresenceState,
  type Peer,
  type PresenceActivity,
  type PresenceState,
} from '@canvasflow/canvas-engine';
import type { SyncAwareness } from '../sync/WebSocketSync';
import type { EditorUser } from '../auth/token';
import { buildRoster, rosterEquals, type RosterEntry } from './roster';

/**
 * The key our record lives under inside the awareness state object.
 *
 * Namespaced rather than spread across top-level fields so anything else that
 * ever wants the awareness channel can coexist without collisions.
 */
const PRESENCE_KEY = 'presence';

/**
 * How often a connected client re-stamps its presence record.
 *
 * Peers stop drawing a cursor whose record has gone stale (PEER_STALE_AFTER_MS),
 * which is what stops a ghost lingering after an unclean disconnect. Without a
 * heartbeat that same rule would erase someone who is present and connected but
 * simply hasn't moved — reading the board is not the same as having left. Kept
 * well inside the stale window so a couple of dropped beats are survivable.
 */
const HEARTBEAT_MS = 5_000;

export interface CollabPresence {
  /**
   * Every remote cursor, for the renderer. Deliberately a ref: this changes at
   * pointer rate, and routing it through React state would re-render the whole
   * editor tree tens of times a second to move an eleven-pixel arrow.
   */
  readonly peersRef: React.MutableRefObject<readonly Peer[]>;
  /** Notifies the presence canvas that `peersRef` changed. */
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Who is on the board, for the peer bar. React state, but updated only when
   * the roster genuinely changes — never on cursor movement.
   */
  readonly roster: readonly RosterEntry[];
  readonly publishCursor: (point: { x: number; y: number } | null) => void;
  readonly publishButton: (button: 'up' | 'down') => void;
  readonly publishSelection: (ids: readonly string[]) => void;
}

interface UseCollabPresenceOptions {
  awareness: SyncAwareness | null;
  user: EditorUser | null;
  activity: PresenceActivity;
}

const EMPTY_SELECTION: readonly string[] = [];

/**
 * Publishes this user's presence and tracks everyone else's.
 *
 * Everything here rides the Yjs awareness channel, which is per-client,
 * expires on disconnect, and never enters the Y.Doc — so none of it is
 * persisted and none of it costs a document update. Writing cursors into the
 * document instead would turn every mouse move into a row in `board_updates`.
 */
export function useCollabPresence({
  awareness,
  user,
  activity,
}: UseCollabPresenceOptions): CollabPresence {
  const peersRef = useRef<readonly Peer[]>([]);
  const listenersRef = useRef(new Set<() => void>());
  const [roster, setRoster] = useState<readonly RosterEntry[]>([]);

  // Held in refs so the publish callbacks below can stay referentially stable:
  // they are wired into pointer handlers, and a new identity on every render
  // would rebind the canvas listeners continuously.
  const awarenessRef = useRef<SyncAwareness | null>(awareness);
  const localRef = useRef<PresenceState | null>(null);

  const frameRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{ x: number; y: number } | null | undefined>(undefined);
  // Survives the local record being rebuilt on reconnect, so a selection made
  // before the socket came up is still published once it does.
  const selectionRef = useRef<readonly string[]>(EMPTY_SELECTION);

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) listener();
  }, []);

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  /** Write the current local record onto the wire. */
  const writeLocal = useCallback(() => {
    const state = localRef.current;
    awarenessRef.current?.setLocalStateField(PRESENCE_KEY, state);
  }, []);

  const patchLocal = useCallback(
    (patch: Partial<PresenceState>) => {
      const current = localRef.current;
      if (!current) return;
      localRef.current = { ...current, ...patch, lastActiveAt: Date.now() };
      writeLocal();
    },
    [writeLocal],
  );

  // --- local identity ------------------------------------------------------
  // Rebuilt whenever the connection is replaced. A reconnect gets a fresh
  // awareness client id, so the record has to be re-published or peers show
  // nothing until the next cursor move.
  useEffect(() => {
    awarenessRef.current = awareness;

    if (!awareness || !user) {
      localRef.current = null;
      return;
    }

    localRef.current = {
      user: { id: user.id, name: user.name },
      cursor: null,
      button: 'up',
      selectedIds: selectionRef.current,
      activity: 'active',
      lastActiveAt: Date.now(),
    };
    writeLocal();

    const heartbeat = window.setInterval(() => {
      const state = localRef.current;
      if (!state) return;
      localRef.current = { ...state, lastActiveAt: Date.now() };
      writeLocal();
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeat);
      // Clearing on the way out is what makes a clean disconnect immediate.
      // Without it, peers keep drawing us until the awareness timeout fires
      // roughly thirty seconds later.
      awareness.setLocalState(null);
    };
  }, [awareness, user, writeLocal]);

  useEffect(() => {
    if (!localRef.current) return;
    patchLocal({ activity });
  }, [activity, patchLocal]);

  // --- remote peers --------------------------------------------------------
  useEffect(() => {
    if (!awareness) {
      peersRef.current = [];
      setRoster([]);
      notify();
      return;
    }

    const handleChange = () => {
      const next: Peer[] = [];

      for (const [clientId, raw] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue;
        // Peer-authored data: validate before it reaches the renderer.
        const parsed = parsePresenceState(
          (raw as Record<string, unknown> | undefined)?.[PRESENCE_KEY],
        );
        if (!parsed) continue;
        next.push({ ...parsed, clientId });
      }

      peersRef.current = next;
      notify();
      setRoster((previous) => {
        const built = buildRoster(next, localRef.current);
        return rosterEquals(previous, built) ? previous : built;
      });
    };

    awareness.on('change', handleChange);
    handleChange();

    return () => {
      awareness.off('change', handleChange);
    };
  }, [awareness, notify]);

  // The local row carries our own name and activity, neither of which arrives
  // through the awareness change event — that only fires for other clients.
  useEffect(() => {
    setRoster((previous) => {
      const built = buildRoster(peersRef.current, localRef.current);
      return rosterEquals(previous, built) ? previous : built;
    });
  }, [user, activity]);

  // --- publishing ----------------------------------------------------------
  const flushCursor = useCallback(() => {
    frameRef.current = null;
    const pending = pendingCursorRef.current;
    if (pending === undefined) return;
    pendingCursorRef.current = undefined;
    patchLocal({ cursor: pending });
  }, [patchLocal]);

  /**
   * Coalesced to one write per animation frame.
   *
   * A pointer can fire faster than the display refreshes, and a fixed-interval
   * throttle would send positions the user has already moved away from. Aligning
   * to the frame sends the newest position and drops the rest.
   */
  const publishCursor = useCallback(
    (point: { x: number; y: number } | null) => {
      if (!localRef.current) return;
      pendingCursorRef.current = point;
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(flushCursor);
      }
    },
    [flushCursor],
  );

  // Not coalesced: a press and its release are transitions, not a stream, and
  // deferring them to a frame is how a click ripple gets lost.
  const publishButton = useCallback(
    (button: 'up' | 'down') => {
      if (localRef.current?.button === button) return;
      patchLocal({ button });
    },
    [patchLocal],
  );

  const publishSelection = useCallback(
    (ids: readonly string[]) => {
      // Recorded even while disconnected, so the identity effect can seed the
      // record with it once a connection exists.
      selectionRef.current = [...ids];
      const current = localRef.current;
      if (!current) return;
      if (sameIds(current.selectedIds, ids)) return;
      patchLocal({ selectedIds: selectionRef.current });
    },
    [patchLocal],
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return useMemo(
    () => ({ peersRef, subscribe, roster, publishCursor, publishButton, publishSelection }),
    [subscribe, roster, publishCursor, publishButton, publishSelection],
  );
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
