import { useCallback, useEffect, useRef, useState } from 'react';
import {
  chaseCamera,
  followCamera,
  type PresenceCamera,
  type PresenceScreen,
} from '@canvasflow/canvas-engine';
import type { PresenceChannel } from './PresenceChannel';

interface UseFollowModeOptions {
  channel: PresenceChannel | null;
  /** Our own user id, to detect a peer following us back. */
  selfUserId: string | null;
  screen: PresenceScreen;
  /** Read at call time so the chase always compares against the live camera. */
  getCamera: () => PresenceCamera;
  setCamera: (camera: PresenceCamera) => void;
}

export interface FollowMode {
  /** The user id being followed, or null. */
  readonly following: string | null;
  readonly follow: (userId: string) => void;
  readonly stop: () => void;
  /**
   * Report camera movement the user made themselves.
   *
   * Any pan or zoom of your own ends the follow — you cannot be carried and
   * steer at the same time, and silently fighting the chase feels broken.
   */
  readonly notifyUserCameraInput: () => void;
}

export function useFollowMode({
  channel,
  selfUserId,
  screen,
  getCamera,
  setCamera,
}: UseFollowModeOptions): FollowMode {
  const [following, setFollowing] = useState<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const settledRef = useRef(false);

  // Held in refs so the chase loop never has to be torn down and rebuilt just
  // because the camera moved.
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const getCameraRef = useRef(getCamera);
  getCameraRef.current = getCamera;
  const setCameraRef = useRef(setCamera);
  setCameraRef.current = setCamera;

  const stop = useCallback(() => {
    setFollowing(null);
  }, []);

  const follow = useCallback((userId: string) => {
    settledRef.current = false;
    setFollowing(userId);
  }, []);

  useEffect(() => {
    if (!channel || !following) return;

    let cancelled = false;

    const step = () => {
      if (cancelled) return;

      const leader = channel.findByUser(following);

      // The leader left the board.
      if (!leader) {
        setFollowing(null);
        return;
      }

      // The leader is following us back. Left alone, the two viewports chase
      // each other and neither ever settles, so the follow that started second
      if (leader.following && selfUserId && leader.following === selfUserId) {
        setFollowing(null);
        return;
      }

      // They are connected but not publishing a camera yet — their client only
      // starts once it notices a follower, so this is normal for a frame or two.
      if (leader.camera && leader.screen) {
        const target = followCamera(leader.camera, leader.screen, screenRef.current);
        const { camera, settled } = chaseCamera(getCameraRef.current(), target, screenRef.current);

        // Once settled, hold still until the leader actually moves again;
        // stepping forever would emit sub-pixel camera writes with nothing to
        // show for them.
        if (!settled || !settledRef.current) {
          setCameraRef.current(camera);
        }
        settledRef.current = settled;
      }

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [channel, following, selfUserId]);

  const notifyUserCameraInput = useCallback(() => {
    setFollowing((current) => (current === null ? current : null));
  }, []);

  return { following, follow, stop, notifyUserCameraInput };
}
