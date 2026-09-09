import { describe, expect, it } from 'vitest';
import {
  EDGE_BAND_PX,
  EDGE_SCROLL_DELAY_MS,
  EDGE_SCROLL_EASE_MS,
  EDGE_SCROLL_MIN_TRAVERSAL_MS,
  EDGE_SCROLL_SPEED,
  edgeProximity,
  edgeScrollPush,
  isNearEdge,
} from './edge-scroll';

const WIDE = 1600;
const TALL = 1200;

const at = (x: number, y: number) => edgeProximity({ x, y }, WIDE, TALL);

/** Long enough that the delay is out of the way and the ramp has finished. */
const SETTLED = EDGE_SCROLL_DELAY_MS + EDGE_SCROLL_EASE_MS;

const pushAt = (x: number, y: number, heldMs = SETTLED, elapsedMs = 16) =>
  edgeScrollPush(at(x, y), WIDE, TALL, heldMs, elapsedMs);

/** One frame's push read back as the rate it is travelling, in px a second. */
const FRAME_MS = 16;
const rate = (push: { dx: number; dy: number }) => ({
  x: push.dx / (FRAME_MS / 1000),
  y: push.dy / (FRAME_MS / 1000),
});

describe('edgeProximity', () => {
  it('reads zero anywhere but the bands', () => {
    expect(at(WIDE / 2, TALL / 2)).toEqual({ x: 0, y: 0 });
    expect(at(EDGE_BAND_PX, EDGE_BAND_PX)).toEqual({ x: 0, y: 0 });
  });

  it('points at the edge the pointer is pressing into', () => {
    expect(at(0, TALL / 2).x).toBeLessThan(0);
    expect(at(WIDE, TALL / 2).x).toBeGreaterThan(0);
    expect(at(WIDE / 2, 0).y).toBeLessThan(0);
    expect(at(WIDE / 2, TALL).y).toBeGreaterThan(0);
  });

  it('deepens across the band', () => {
    const half = at(EDGE_BAND_PX / 2, TALL / 2).x;
    expect(half).toBeCloseTo(-0.5);
    expect(at(0, TALL / 2).x).toBe(-1);
  });

  it('saturates once the pointer is off the canvas', () => {
    // A drag holds pointer capture, so the pointer keeps reporting from well
    // outside. Past the edge is still just "as fast as this goes".
    expect(at(-500, TALL / 2).x).toBe(-1);
    expect(at(WIDE + 500, TALL / 2).x).toBe(1);
  });

  it('reads both axes at once in a corner', () => {
    expect(at(0, 0)).toEqual({ x: -1, y: -1 });
  });

  it('reads zero on an axis with no size, rather than dividing by it', () => {
    // The canvas is measured after mount; the first frames can see nothing.
    expect(edgeProximity({ x: 0, y: 0 }, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('isNearEdge', () => {
  it('is true when either axis is in a band', () => {
    expect(isNearEdge(at(WIDE / 2, TALL / 2))).toBe(false);
    expect(isNearEdge(at(0, TALL / 2))).toBe(true);
    expect(isNearEdge(at(WIDE / 2, TALL))).toBe(true);
  });
});

describe('edgeScrollPush', () => {
  it('stays still until the delay has passed', () => {
    expect(pushAt(0, TALL / 2, EDGE_SCROLL_DELAY_MS)).toEqual({ dx: 0, dy: 0 });
    expect(pushAt(0, TALL / 2, EDGE_SCROLL_DELAY_MS + 1).dx).toBeLessThan(0);
  });

  it('starts from still rather than stepping straight to a fraction of full speed', () => {
    const first = Math.abs(pushAt(0, TALL / 2, EDGE_SCROLL_DELAY_MS + 1).dx);
    const settled = Math.abs(pushAt(0, TALL / 2).dx);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(settled / 100);
  });

  it('speeds up over the ramp and then holds', () => {
    const during = [0.25, 0.5, 0.75, 1].map((t) =>
      Math.abs(pushAt(0, TALL / 2, EDGE_SCROLL_DELAY_MS + EDGE_SCROLL_EASE_MS * t).dx),
    );
    expect(during).toEqual([...during].sort((a, b) => a - b));
    expect(Math.abs(pushAt(0, TALL / 2, SETTLED * 10).dx)).toBeCloseTo(
      Math.abs(pushAt(0, TALL / 2).dx),
    );
  });

  it('covers the same ground per unit of time whatever the frame rate', () => {
    const oneLongFrame = Math.abs(pushAt(0, TALL / 2, SETTLED, 32).dx);
    const twoShortFrames = 2 * Math.abs(pushAt(0, TALL / 2, SETTLED, 16).dx);
    expect(oneLongFrame).toBeCloseTo(twoShortFrames);
  });

  it('runs at the full rate on a viewport with room for it', () => {
    // 1600px at 1200px/s takes longer to cross than the minimum traversal, so
    // nothing caps it.
    expect(rate(pushAt(WIDE, TALL / 2)).x).toBeCloseTo(EDGE_SCROLL_SPEED);
  });

  it('holds a narrow viewport to a speed you can still react to', () => {
    const narrow = 400;
    const push = edgeScrollPush(
      edgeProximity({ x: narrow, y: TALL / 2 }, narrow, TALL),
      narrow,
      TALL,
      SETTLED,
      FRAME_MS,
    );
    // Full speed would clear these 400px in a third of a second.
    expect(rate(push).x).toBeCloseTo((narrow * 1000) / EDGE_SCROLL_MIN_TRAVERSAL_MS);
    expect(rate(push).x).toBeLessThan(EDGE_SCROLL_SPEED);
  });

  it('scales each axis by its own size, not by the smaller of the two', () => {
    // Narrow and tall, held in the bottom-right corner: the width is small
    // enough to be capped and the height is not.
    const size = { width: 300, height: 2000 };
    const push = edgeScrollPush(
      edgeProximity({ x: size.width, y: size.height }, size.width, size.height),
      size.width,
      size.height,
      SETTLED,
      FRAME_MS,
    );
    expect(rate(push).x).toBeCloseTo((size.width * 1000) / EDGE_SCROLL_MIN_TRAVERSAL_MS);
    expect(rate(push).y).toBeCloseTo(EDGE_SCROLL_SPEED);
  });

  it('does not hand back a whole backgrounded tab as one enormous step', () => {
    // requestAnimationFrame stops in a hidden tab. The frame that arrives on
    // the way back reports every second you were away, and counting it would
    // fling the board across the board.
    const stalled = Math.abs(pushAt(0, TALL / 2, SETTLED, 30_000).dx);
    expect(stalled).toBeLessThan(EDGE_SCROLL_SPEED / 10);
  });

  it('pushes diagonally out of a corner', () => {
    const push = pushAt(WIDE, TALL);
    expect(push.dx).toBeGreaterThan(0);
    expect(push.dy).toBeGreaterThan(0);
  });
});
