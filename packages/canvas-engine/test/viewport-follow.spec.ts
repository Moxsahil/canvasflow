import { describe, expect, it } from 'vitest';
import {
  chaseCamera,
  cameraForViewport,
  fitViewport,
  followCamera,
  viewportOf,
  FOLLOW_SNAP_PX,
} from '../src/presence/viewport-follow.js';

const WIDE = { width: 1600, height: 900 }; // 16:9
const TALL = { width: 800, height: 1200 }; // 2:3
const SQUARE = { width: 1000, height: 1000 };

describe('viewportOf', () => {
  it('shows more of the board on a bigger screen at the same zoom', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    expect(viewportOf(camera, WIDE).width).toBeGreaterThan(viewportOf(camera, TALL).width);
  });

  it('shows less of the board as zoom increases', () => {
    expect(viewportOf({ x: 0, y: 0, zoom: 2 }, WIDE).width).toBe(800);
    expect(viewportOf({ x: 0, y: 0, zoom: 0.5 }, WIDE).width).toBe(3200);
  });
});

describe('fitViewport', () => {
  const leader = { x: 100, y: 100, width: 800, height: 450 }; // 16:9

  it('keeps the follower aspect ratio', () => {
    const fitted = fitViewport(leader, TALL);
    expect(fitted.width / fitted.height).toBeCloseTo(TALL.width / TALL.height, 6);
  });

  it('shares the leader centre', () => {
    const fitted = fitViewport(leader, TALL);
    expect(fitted.x + fitted.width / 2).toBeCloseTo(leader.x + leader.width / 2, 6);
    expect(fitted.y + fitted.height / 2).toBeCloseTo(leader.y + leader.height / 2, 6);
  });

  it.each([
    ['wide follower', WIDE],
    ['tall follower', TALL],
    ['square follower', SQUARE],
  ])('fully contains the leader view — %s', (_label, screen) => {
    // The property the whole feature rests on: whatever the leader points at,
    // the follower can see. Never crop, only grow.
    const fitted = fitViewport(leader, screen);
    expect(fitted.x).toBeLessThanOrEqual(leader.x + 1e-9);
    expect(fitted.y).toBeLessThanOrEqual(leader.y + 1e-9);
    expect(fitted.x + fitted.width).toBeGreaterThanOrEqual(leader.x + leader.width - 1e-9);
    expect(fitted.y + fitted.height).toBeGreaterThanOrEqual(leader.y + leader.height - 1e-9);
  });

  it('is an identity when the aspect ratios already match', () => {
    const sameShape = { x: 0, y: 0, width: 1600, height: 900 };
    const fitted = fitViewport(sameShape, WIDE);
    expect(fitted).toEqual(sameShape);
  });

  it('grows height for a taller follower, not width', () => {
    const fitted = fitViewport(leader, TALL);
    expect(fitted.width).toBeCloseTo(leader.width, 6);
    expect(fitted.height).toBeGreaterThan(leader.height);
  });

  it('grows width for a wider follower, not height', () => {
    const tallLeader = { x: 0, y: 0, width: 400, height: 800 };
    const fitted = fitViewport(tallLeader, WIDE);
    expect(fitted.height).toBeCloseTo(tallLeader.height, 6);
    expect(fitted.width).toBeGreaterThan(tallLeader.width);
  });
});

describe('followCamera', () => {
  it('reproduces the leader camera when the screens match', () => {
    const leaderCamera = { x: 250, y: -80, zoom: 1.5 };
    const follower = followCamera(leaderCamera, WIDE, WIDE);
    // Compared field-wise rather than with toEqual: the round trip divides by
    // zoom and then by the resulting width, so the value returns as
    // 1.5000000000000002. Exactness is not the property under test.
    expect(follower.x).toBeCloseTo(leaderCamera.x, 9);
    expect(follower.y).toBeCloseTo(leaderCamera.y, 9);
    expect(follower.zoom).toBeCloseTo(leaderCamera.zoom, 9);
  });

  it('zooms out rather than cropping on a narrower screen', () => {
    const leaderCamera = { x: 0, y: 0, zoom: 1 };
    const follower = followCamera(leaderCamera, WIDE, TALL);
    expect(follower.zoom).toBeLessThan(leaderCamera.zoom);
  });

  it('round-trips through cameraForViewport', () => {
    const camera = { x: 12, y: 34, zoom: 0.75 };
    expect(cameraForViewport(viewportOf(camera, WIDE), WIDE)).toEqual(camera);
  });

  it('lets the follower see a point at the leader viewport edge', () => {
    const leaderCamera = { x: 0, y: 0, zoom: 1 };
    const leaderView = viewportOf(leaderCamera, WIDE);
    const bottomRight = { x: leaderView.width - 1, y: leaderView.height - 1 };

    const followerCamera = followCamera(leaderCamera, WIDE, TALL);
    const followerView = viewportOf(followerCamera, TALL);

    expect(bottomRight.x).toBeLessThanOrEqual(followerView.x + followerView.width);
    expect(bottomRight.y).toBeLessThanOrEqual(followerView.y + followerView.height);
  });
});

describe('chaseCamera', () => {
  const screen = WIDE;

  it('reports settled and snaps exactly once close enough', () => {
    const target = { x: 100, y: 100, zoom: 1 };
    const nearly = { x: 100 + FOLLOW_SNAP_PX / 2, y: 100, zoom: 1 };
    const result = chaseCamera(nearly, target, screen);
    expect(result.settled).toBe(true);
    // Snapping to the target exactly is what stops endless sub-pixel writes.
    expect(result.camera).toEqual(target);
  });

  it('moves toward the target without overshooting', () => {
    const current = { x: 0, y: 0, zoom: 1 };
    const target = { x: 1000, y: 500, zoom: 2 };
    const { camera, settled } = chaseCamera(current, target, screen);

    expect(settled).toBe(false);
    expect(camera.x).toBeGreaterThan(current.x);
    expect(camera.x).toBeLessThan(target.x);
    expect(camera.zoom).toBeGreaterThan(current.zoom);
    expect(camera.zoom).toBeLessThan(target.zoom);
  });

  it('converges, and each step is smaller than the last', () => {
    const target = { x: 1000, y: 500, zoom: 1 };
    let camera = { x: 0, y: 0, zoom: 1 };
    let previousStep = Infinity;
    let frames = 0;

    let settled = false;
    while (frames < 200) {
      const result = chaseCamera(camera, target, screen);
      const step = Math.abs(result.camera.x - camera.x);
      // Take the camera before testing for arrival: the settling step is the
      // one that snaps exactly onto the target.
      camera = result.camera;
      frames += 1;
      if (result.settled) {
        settled = true;
        break;
      }
      // Ease-out: a constant fraction of a shrinking gap is a shrinking step.
      expect(step).toBeLessThanOrEqual(previousStep + 1e-9);
      previousStep = step;
    }

    expect(settled).toBe(true);
    expect(frames).toBeLessThan(200);
    expect(camera).toEqual(target);
  });

  it('treats a zoom-only difference as movement', () => {
    // Position matches; only scale differs. Comparing zoom as a ratio alone
    // would call this settled and leave the follower at the wrong scale.
    const current = { x: 0, y: 0, zoom: 1 };
    const target = { x: 0, y: 0, zoom: 4 };
    expect(chaseCamera(current, target, screen).settled).toBe(false);
  });
});
