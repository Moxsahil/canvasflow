import { drawLaserTrail } from '../src/laser/draw-laser.js';
import {
  LASER_FADE_TIME,
  LASER_HOLD_TIME,
  LASER_WIDTH,
  LaserStroke,
  LaserTrail,
} from '../src/laser/laser-trail.js';

/** One press–drag–release, laid out as a straight run well clear of the spacing floor. */
function gesture(
  trail: LaserTrail,
  at: number,
  options: { points?: number; y?: number } = {},
): void {
  const { points = 10, y = 0 } = options;
  trail.begin(0, y, at);
  for (let i = 1; i < points; i++) trail.extend(i * 20, y, at);
  trail.end(at);
}

function pointsAt(trail: LaserTrail, now: number): number {
  return trail.strokesAt(now).reduce((total, stroke) => total + stroke.pointCount(), 0);
}

describe('LaserStroke', () => {
  it('turns away a sample that has barely moved', () => {
    const stroke = new LaserStroke();

    expect(stroke.addPoint(0, 0)).toBe(true);
    // A stroke is kept in full for the length of the gesture, so a pointer
    // sitting still must not grow it a point per event.
    expect(stroke.addPoint(0.5, 0)).toBe(false);
    expect(stroke.addPoint(0, 0)).toBe(false);
    expect(stroke.pointCount()).toBe(1);

    expect(stroke.addPoint(40, 0)).toBe(true);
  });

  it('measures spacing against the pointer, not against its own smoothed head', () => {
    const stroke = new LaserStroke();
    stroke.addPoint(0, 0);
    stroke.addPoint(100, 0);

    // The drawn head lags at x≈73. A second sample at x=100 is a pointer that
    // has not moved, and must be turned away however far the head is behind.
    expect(stroke.addPoint(100, 0)).toBe(false);
  });

  it('eases each sample toward the pointer rather than landing on it', () => {
    const stroke = new LaserStroke();
    stroke.addPoint(0, 0);
    stroke.addPoint(100, 0);

    // That easing is what stops the trail reading as a jagged polyline.
    const head = stroke.livePoints()[1]!;
    expect(head.x).toBeGreaterThan(0);
    expect(head.x).toBeLessThan(100);
  });
});

describe('LaserTrail', () => {
  it('is empty before anything is drawn, so no frame loop starts', () => {
    expect(new LaserTrail().isEmpty()).toBe(true);
  });

  it('keeps the whole stroke while the pointer is down, however long that is', () => {
    const trail = new LaserTrail();
    trail.begin(0, 0, 0);
    for (let i = 1; i < 10; i++) trail.extend(i * 20, 0, 0);

    // Nothing is on a clock until the hand stops. A gesture held for a minute
    // is still whole at the end of it.
    expect(pointsAt(trail, 60_000)).toBe(10);
    expect(trail.isDrawing()).toBe(true);
  });

  it('holds a finished stroke whole, then erases it', () => {
    const trail = new LaserTrail();
    gesture(trail, 0);

    expect(pointsAt(trail, LASER_HOLD_TIME - 1)).toBe(10);

    const midFade = pointsAt(trail, LASER_HOLD_TIME + LASER_FADE_TIME * 0.6);
    expect(midFade).toBeGreaterThan(0);
    expect(midFade).toBeLessThan(10);

    expect(pointsAt(trail, LASER_HOLD_TIME + LASER_FADE_TIME)).toBe(0);
    expect(trail.isEmpty()).toBe(true);
  });

  it('lets a later gesture join the first, so the pair leaves together', () => {
    const trail = new LaserTrail();
    gesture(trail, 0);
    // Within the hold, so this joins the group rather than starting one.
    gesture(trail, 1000, { y: 500 });

    // Long past the point where the first gesture would have gone on its own:
    // the group's clock restarted when the second one landed.
    expect(pointsAt(trail, 1000 + LASER_HOLD_TIME - 1)).toBe(20);
    expect(trail.strokesAt(1000 + LASER_HOLD_TIME - 1)).toHaveLength(2);

    expect(pointsAt(trail, 1000 + LASER_HOLD_TIME + LASER_FADE_TIME)).toBe(0);
  });

  it('erases a group from the beginning, oldest gesture first', () => {
    const trail = new LaserTrail();
    gesture(trail, 0);
    gesture(trail, 0, { y: 500 });

    // 20 points in the group, 64% of the way through an eased fade.
    const strokes = trail.strokesAt(LASER_HOLD_TIME + LASER_FADE_TIME * 0.8);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.pointCount()).toBe(8);
    // The survivor is the newer gesture: the older one went first, entirely.
    expect(strokes[0]!.livePoints()[0]!.y).toBe(500);
  });

  it('starts a fresh group once the old one has begun leaving', () => {
    const trail = new LaserTrail();
    gesture(trail, 0);

    // Mid-fade. A new stroke must not revive a group already halfway off the
    // board, nor be dragged down by its clock.
    const during = LASER_HOLD_TIME + LASER_FADE_TIME * 0.8;
    trail.begin(0, 900, during);
    expect(pointsAt(trail, during)).toBe(5);

    // The old group finishes leaving on its own schedule; the new one is
    // untouched because the pointer is still down on it.
    const after = LASER_HOLD_TIME + LASER_FADE_TIME;
    const strokes = trail.strokesAt(after);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.livePoints()[0]!.y).toBe(900);
  });

  it('ignores moves made after the gesture ended', () => {
    const trail = new LaserTrail();
    gesture(trail, 0);

    // Pointer moves are what hold a group up, so a cursor wandering across the
    // board after the release must not keep the trail on screen forever.
    expect(trail.extend(400, 400, 500)).toBe(false);
    expect(pointsAt(trail, LASER_HOLD_TIME + LASER_FADE_TIME)).toBe(0);
  });

  it('leaves a single point for a press with no movement', () => {
    const trail = new LaserTrail();
    trail.begin(50, 50, 0);
    trail.end(0);

    // Pressing without dragging is still a gesture — "look here" — and the
    // renderer draws it as a dot.
    expect(pointsAt(trail, 0)).toBe(1);
    expect(pointsAt(trail, LASER_HOLD_TIME + LASER_FADE_TIME)).toBe(0);
  });

  it('keeps a stroke whose pointerup was lost, rather than joining it to the next', () => {
    const trail = new LaserTrail();
    trail.begin(0, 0, 0);
    trail.extend(20, 0, 0);

    trail.begin(500, 500, 2);
    trail.extend(520, 500, 2);

    const strokes = trail.strokesAt(2);
    expect(strokes).toHaveLength(2);
    expect(trail.isDrawing()).toBe(true);
  });
});

describe('drawLaserTrail', () => {
  function paint(trail: LaserTrail, now: number, zoom = 1) {
    const canvas = new OffscreenCanvas(200, 100);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    // The layer hands over a context already scaled by the camera.
    ctx.scale(zoom, zoom);
    drawLaserTrail(ctx, trail, { color: '#ff0000', zoom, now });
    return ctx.getImageData(0, 0, 200, 100).data;
  }

  /** A horizontal beam that lands on the same screen pixels at any zoom. */
  function beam(zoom = 1): LaserTrail {
    const trail = new LaserTrail();
    trail.begin(20 / zoom, 50 / zoom, 0);
    for (let x = 40; x <= 190; x += 10) trail.extend(x / zoom, 50 / zoom, 0);
    return trail;
  }

  /** Height of the bright core in one column, ignoring the faint halo around it. */
  function coreHeight(pixels: Uint8ClampedArray, x: number): number {
    let rows = 0;
    for (let y = 0; y < 100; y++) {
      if (pixels[(y * 200 + x) * 4 + 3]! > 128) rows++;
    }
    return rows;
  }

  it('draws one width from end to end, with no taper', () => {
    const pixels = paint(beam(), 0);
    const nearTail = coreHeight(pixels, 40);
    const nearHead = coreHeight(pixels, 150);

    // The old trail thinned toward the tail, which spent most of a gesture
    // below a pixel wide and read as a scratch rather than a beam.
    expect(nearTail).toBe(nearHead);
    expect(nearHead).toBeGreaterThanOrEqual(LASER_WIDTH - 1);
  });

  it('holds its screen width as the board zooms', () => {
    // Drawn in world units, so the beam has to be divided by zoom to come out
    // the same thickness on screen — the rule the peer cursors follow too.
    expect(coreHeight(paint(beam(4), 0, 4), 40)).toBe(coreHeight(paint(beam(), 0), 40));
  });

  it('draws a press with no movement as a dot', () => {
    const trail = new LaserTrail();
    trail.begin(100, 50, 0);
    trail.end(0);

    // A zero-length path strokes nothing at all, so this case is drawn as a
    // filled circle instead.
    expect(coreHeight(paint(trail, 0), 100)).toBeGreaterThanOrEqual(LASER_WIDTH - 1);
  });

  it('paints nothing once the group has gone', () => {
    const trail = new LaserTrail();
    trail.begin(20, 50, 0);
    trail.extend(180, 50, 0);
    trail.end(0);

    const pixels = paint(trail, LASER_HOLD_TIME + LASER_FADE_TIME);
    expect(pixels.some((channel, i) => i % 4 === 3 && channel > 0)).toBe(false);
  });
});
