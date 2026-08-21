import type { PresenceCamera, PresenceScreen } from './presence-state.js';

export interface WorldRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The region of the board a camera is currently showing, in world coordinates.
 *
 * Screen size is part of the answer: the same camera shows more of the board on
 * a larger window, which is exactly why a follower cannot simply copy a
 * leader's camera.
 */
export function viewportOf(camera: PresenceCamera, screen: PresenceScreen): WorldRect {
  return {
    x: camera.x,
    y: camera.y,
    width: screen.width / camera.zoom,
    height: screen.height / camera.zoom,
  };
}

/**
 * Fit the leader's viewport into the follower's window, preserving the
 * follower's aspect ratio.
 *
 * Copying the leader's camera outright is wrong the moment two people have
 * differently shaped windows: on a narrower screen the follower would see less
 * than the leader is pointing at, which defeats the entire feature. Instead the
 * result grows along whichever axis it must until it *contains* the leader's
 * view, then centres on it.
 *
 * The follower therefore always sees everything the leader sees, and on a
 * differently shaped screen sees a little extra rather than missing an edge.
 */
export function fitViewport(leader: WorldRect, followerScreen: PresenceScreen): WorldRect {
  const aspect = followerScreen.width / followerScreen.height;

  let width = leader.width;
  let height = width / aspect;

  // Too short to contain the leader's view — grow the other way instead.
  if (height < leader.height) {
    height = leader.height;
    width = height * aspect;
  }

  const centerX = leader.x + leader.width / 2;
  const centerY = leader.y + leader.height / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

/** Turn a target region back into the camera that would show it. */
export function cameraForViewport(target: WorldRect, screen: PresenceScreen): PresenceCamera {
  return {
    x: target.x,
    y: target.y,
    zoom: screen.width / target.width,
  };
}

/**
 * The camera a follower should adopt to match a leader — the whole calculation
 * in one call.
 */
export function followCamera(
  leaderCamera: PresenceCamera,
  leaderScreen: PresenceScreen,
  followerScreen: PresenceScreen,
): PresenceCamera {
  const target = fitViewport(viewportOf(leaderCamera, leaderScreen), followerScreen);
  return cameraForViewport(target, followerScreen);
}

export const FOLLOW_SNAP_PX = 2;

/**
 * Fraction of the remaining distance to cover this frame.
 *
 * Applying a constant fraction each frame produces an ease-out: the step
 * shrinks as the gap closes. Low enough to look carried rather than yanked.
 */
export const FOLLOW_CHASE_T = 0.28;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export interface ChaseResult {
  readonly camera: PresenceCamera;
  /** True once within FOLLOW_SNAP_PX — the caller should stop stepping. */
  readonly settled: boolean;
}

/**
 * One frame of the chase.
 *
 * Returns the camera to adopt now and whether the follower has arrived. The
 * comparison is done in screen pixels rather than world units so the stopping
 * threshold means the same thing at every zoom level.
 */
export function chaseCamera(
  current: PresenceCamera,
  target: PresenceCamera,
  screen: PresenceScreen,
  t: number = FOLLOW_CHASE_T,
): ChaseResult {
  const dx = (target.x - current.x) * target.zoom;
  const dy = (target.y - current.y) * target.zoom;
  // Compare zoom as the screen-space size difference it causes, so a small
  // ratio change on a large viewport still counts as movement.
  const dZoom = Math.abs(1 - current.zoom / target.zoom) * screen.width;

  if (Math.abs(dx) < FOLLOW_SNAP_PX && Math.abs(dy) < FOLLOW_SNAP_PX && dZoom < FOLLOW_SNAP_PX) {
    return { camera: target, settled: true };
  }

  return {
    camera: {
      x: lerp(current.x, target.x, t),
      y: lerp(current.y, target.y, t),
      zoom: lerp(current.zoom, target.zoom, t),
    },
    settled: false,
  };
}
