import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  LaserTrail,
  drawLaserTrail,
  isPeerFresh,
  presenceColorFor,
  type Peer,
  type PresenceTheme,
} from '@canvasflow/canvas-engine';

/**
 * Every laser trail on the board — this client's, and one per peer.
 *
 * Peers do not send their trail. Awareness re-broadcasts a client's whole
 * record on every change, so a growing point array would go over the wire
 * repeatedly for the length of a stroke. Instead each peer's `lasering` flag
 * says whether the cursor samples already arriving on their presence record are
 * part of a stroke, and this rebuilds the trail from those. The stream is
 * already there and already published once per animation frame.
 *
 * The consequence is that a peer's trail is only as detailed as their cursor
 * feed. In exchange it costs one boolean, and the fidelity is bounded by the
 * same rate their cursor already moves at — so the trail can never lag the
 * cursor it is attached to.
 */

export interface LaserTrails {
  /** Start this client's stroke at a world point. */
  begin: (x: number, y: number) => void;
  extend: (x: number, y: number) => void;
  end: () => void;
  /**
   * Paint every live trail. Called by the layer's own frame loop, never by
   * React — the trail changes every frame, and a render per frame would repaint
   * the whole scene along with it.
   */
  draw: (ctx: CanvasRenderingContext2D, zoom: number) => void;
  /** Subscribe to "there is something to animate". Drives the frame loop. */
  onActivity: (listener: () => void) => () => void;
  /** False once everything has faded, so the loop can stop. */
  hasWork: () => boolean;
}

interface UseLaserTrailsOptions {
  peersRef: React.MutableRefObject<readonly Peer[]>;
  subscribe: (listener: () => void) => () => void;
  /** This client's own id, so its own presence record isn't drawn twice. */
  userId: string | null;
  theme: PresenceTheme;
}

export function useLaserTrails({
  peersRef,
  subscribe,
  userId,
  theme,
}: UseLaserTrailsOptions): LaserTrails {
  const localRef = useRef(new LaserTrail());
  // The author's id is kept beside the trail rather than looked up each frame:
  // a peer who leaves mid-stroke drops off the roster while their trail is
  // still fading, and a lookup would lose their colour partway through.
  const peerTrailsRef = useRef(new Map<number, { trail: LaserTrail; userId: string }>());
  const listenersRef = useRef(new Set<() => void>());

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const wake = useCallback(() => {
    for (const listener of listenersRef.current) listener();
  }, []);

  const begin = useCallback(
    (x: number, y: number) => {
      localRef.current.begin(x, y, performance.now());
      wake();
    },
    [wake],
  );

  const extend = useCallback(
    (x: number, y: number) => {
      localRef.current.extend(x, y, performance.now());
      wake();
    },
    [wake],
  );

  const end = useCallback(() => {
    localRef.current.end(performance.now());
    wake();
  }, [wake]);

  /**
   * Fold each peer's latest presence record into their trail.
   *
   * Runs on presence change rather than on a timer: a peer's cursor arrives as
   * a presence update, so this fires exactly as often as there is a new point.
   */
  useEffect(
    () =>
      subscribe(() => {
        const now = performance.now();
        const trails = peerTrailsRef.current;
        const seen = new Set<number>();
        let changed = false;

        for (const peer of peersRef.current) {
          // Our own record comes back to us on some transports. Drawing it
          // would double every local stroke, one lagging the other.
          if (peer.user.id === userIdRef.current) continue;
          seen.add(peer.clientId);

          let entry = trails.get(peer.clientId);
          if (!entry) {
            entry = { trail: new LaserTrail(), userId: peer.user.id };
            trails.set(peer.clientId, entry);
          }
          const trail = entry.trail;

          const point = peer.cursor;
          const lasering = peer.lasering && !!point && isPeerFresh(peer, Date.now());

          if (lasering && point) {
            if (!trail.isDrawing()) {
              trail.begin(point.x, point.y, now);
              changed = true;
            } else if (trail.extend(point.x, point.y, now)) {
              // Presence updates for other reasons — a selection change, a
              // heartbeat — re-deliver the same cursor. The trail turns those
              // away itself; all that is needed here is not to wake the frame
              // loop for a point that was never added.
              changed = true;
            }
          } else if (trail.isDrawing()) {
            trail.end(now);
            changed = true;
          }
        }

        // A peer who left stops being drawn, but their trail is left to fade
        // rather than cut — a stroke vanishing mid-air reads as a glitch.
        for (const [clientId, entry] of trails) {
          if (seen.has(clientId)) continue;
          if (entry.trail.isDrawing()) {
            entry.trail.end(now);
            changed = true;
          }
          if (entry.trail.isEmpty()) trails.delete(clientId);
        }

        if (changed) wake();
      }),
    [subscribe, peersRef, wake],
  );

  const draw = useCallback((ctx: CanvasRenderingContext2D, zoom: number) => {
    const now = performance.now();

    for (const [clientId, entry] of peerTrailsRef.current) {
      if (entry.trail.isEmpty()) {
        peerTrailsRef.current.delete(clientId);
        continue;
      }
      // Their presence colour, so two people pointing at once stay apart —
      // and so a trail matches the cursor it came from.
      const color = presenceColorFor(entry.userId, themeRef.current);
      drawLaserTrail(ctx, entry.trail, { color, zoom, now });
    }

    const self = userIdRef.current;
    if (self) {
      const color = presenceColorFor(self, themeRef.current);
      drawLaserTrail(ctx, localRef.current, { color, zoom, now });
    }
  }, []);

  const hasWork = useCallback(() => {
    if (!localRef.current.isEmpty()) return true;
    for (const entry of peerTrailsRef.current.values()) {
      if (!entry.trail.isEmpty()) return true;
    }
    return false;
  }, []);

  const onActivity = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return useMemo(
    () => ({ begin, extend, end, draw, onActivity, hasWork }),
    [begin, extend, end, draw, onActivity, hasWork],
  );
}
