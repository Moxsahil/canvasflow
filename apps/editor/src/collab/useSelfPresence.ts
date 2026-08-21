import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PresenceActivity, PresenceCamera, PresenceScreen } from '@canvasflow/canvas-engine';
import type { PresenceChannel } from './PresenceChannel';
import type { EditorUser } from '../auth/token';

/**
 * How often a connected client re-stamps its record.
 *
 * Peers stop drawing a cursor whose record has gone stale, which is what
 * prevents a ghost lingering after an unclean disconnect. Without a heartbeat
 * that same rule would erase someone who is present and connected but simply
 * has not moved — reading the board is not the same as having left. Kept well
 * inside the stale window so a couple of dropped beats are survivable.
 */
const HEARTBEAT_MS = 5_000;

interface UseSelfPresenceOptions {
  channel: PresenceChannel | null;
  user: EditorUser | null;
  activity: PresenceActivity;
  /** Live camera and viewport, published only while someone follows us. */
  camera: PresenceCamera;
  screen: PresenceScreen;
  /** Who we are following, if anyone. */
  following: string | null;
}

export interface SelfPresence {
  /** World-space pointer position, or null when it leaves the canvas. */
  readonly setCursor: (point: { x: number; y: number } | null) => void;
  readonly setSelection: (ids: readonly string[]) => void;
}

/**
 * Publishes this client's presence.
 *
 * Split from the subscribing side so the two rates stay independent: this
 * writes at pointer rate, while the roster it feeds changes only when someone
 * joins or leaves.
 */
export function useSelfPresence({
  channel,
  user,
  activity,
  camera,
  screen,
  following,
}: UseSelfPresenceOptions): SelfPresence {
  // Written through refs so the callbacks below stay referentially stable —
  // they are wired into pointer handlers, and a new identity every render would
  // rebind the canvas listeners continuously.
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const selectionRef = useRef<readonly string[]>([]);
  const frameRef = useRef<number | null>(null);

  const followedRef = useRef(false);

  useEffect(() => {
    if (!channel || !user) return;
    return channel.subscribe((peers) => {
      followedRef.current = peers.some((peer) => peer.following === user.id);
    });
  }, [channel, user]);

  // Identity is rebuilt whenever the connection is replaced: a reconnect issues
  // a fresh awareness client id, so the record must be re-published or peers
  // see nothing until the next cursor move.
  useEffect(() => {
    if (!channel || !user) return;

    channel.publish({
      user: { id: user.id, name: user.name },
      cursor: cursorRef.current,
      selection: selectionRef.current,
      camera: null,
      screen: null,
      following: null,
      activity: 'active',
      lastActive: Date.now(),
    });

    const heartbeat = window.setInterval(() => {
      channel.patch({});
    }, HEARTBEAT_MS);

    return () => window.clearInterval(heartbeat);
  }, [channel, user]);

  useEffect(() => {
    channel?.patch({ activity });
  }, [channel, activity]);

  useEffect(() => {
    channel?.patch({ following });
  }, [channel, following]);

  // The camera changes on every pan and zoom frame, so this effect would be
  // extremely hot if it published unconditionally. It doesn't: without a
  // follower there is nothing on the wire.
  useEffect(() => {
    if (!channel) return;
    if (!followedRef.current) {
      if (channel.getLocal()?.camera) channel.patch({ camera: null, screen: null });
      return;
    }
    channel.patch({ camera, screen });
  }, [channel, camera, screen]);

  const flushCursor = useCallback(() => {
    frameRef.current = null;
    channel?.patch({ cursor: cursorRef.current });
  }, [channel]);

  /**
   * Coalesced to one write per animation frame.
   *
   * A pointer can fire faster than the display refreshes, and a fixed-interval
   * throttle sends positions the user has already moved away from. Aligning to
   * the frame sends the newest and drops the rest.
   */
  const setCursor = useCallback(
    (point: { x: number; y: number } | null) => {
      cursorRef.current = point;
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(flushCursor);
      }
    },
    [flushCursor],
  );

  const setSelection = useCallback(
    (ids: readonly string[]) => {
      const previous = selectionRef.current;
      if (previous.length === ids.length && previous.every((id, i) => id === ids[i])) return;
      selectionRef.current = [...ids];
      channel?.patch({ selection: selectionRef.current });
    },
    [channel],
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return useMemo(() => ({ setCursor, setSelection }), [setCursor, setSelection]);
}
