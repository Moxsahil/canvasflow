import { describe, expect, it } from 'vitest';
import { createEllipse, createRectangle, type Rect, type Shape } from '@canvasflow/canvas-engine';
import {
  buildSnapTargets,
  gapsAlong,
  shapeSnapPoints,
  snapThreshold,
  worldViewport,
} from './snap-targets';
import {
  dragSnapPoints,
  guidesEqual,
  nearestTargetPoint,
  resizeSnapPoints,
  resolveSnap,
  snappingActive,
} from './snap';

const rect = (id: string, x: number, y: number, width: number, height: number): Shape =>
  createRectangle({ id, x, y, width, height });

const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

/** Everything on screen, so nothing is filtered out by the viewport. */
const WIDE_VIEW: Rect = { x: -10_000, y: -10_000, width: 20_000, height: 20_000 };

const targetsFor = (shapes: readonly Shape[], midpoints = false) =>
  buildSnapTargets(shapes, new Set<string>(), WIDE_VIEW, { midpoints });

/** A drag of a single free-standing box, snapped against the given shapes. */
function dragAgainst(
  moving: Rect,
  others: readonly Shape[],
  options: { midpoints?: boolean; threshold?: number } = {},
) {
  const midpoints = options.midpoints ?? false;
  return resolveSnap({
    bounds: moving,
    points: dragSnapPoints([], moving, midpoints),
    targets: targetsFor(others, midpoints),
    threshold: options.threshold ?? 8,
  });
}

describe('snapThreshold', () => {
  it('holds the pull steady in screen pixels as the zoom changes', () => {
    expect(snapThreshold(1)).toBe(8);
    expect(snapThreshold(2)).toBe(4);
    expect(snapThreshold(0.5)).toBe(16);
  });
});

describe('snappingActive', () => {
  it('lets the override key ask for a snap when the preference is off', () => {
    expect(snappingActive(false, false)).toBe(false);
    expect(snappingActive(false, true)).toBe(true);
  });

  it('lets the same key decline one when the preference is on', () => {
    expect(snappingActive(true, false)).toBe(true);
    expect(snappingActive(true, true)).toBe(false);
  });
});

describe('shapeSnapPoints', () => {
  it('offers the corners and centre of a rectangle', () => {
    const points = shapeSnapPoints(rect('r', 0, 0, 100, 50), false);
    expect(points).toHaveLength(5);
    expect(points).toContainEqual({ x: 0, y: 0 });
    expect(points).toContainEqual({ x: 100, y: 50 });
    expect(points).toContainEqual({ x: 50, y: 25 });
  });

  it('adds the centre of each edge when midpoints are wanted', () => {
    const points = shapeSnapPoints(rect('r', 0, 0, 100, 50), true);
    expect(points).toHaveLength(9);
    expect(points).toContainEqual({ x: 50, y: 0 });
    expect(points).toContainEqual({ x: 0, y: 25 });
  });

  it('gives an ellipse the points its outline passes through, not its corners', () => {
    const points = shapeSnapPoints(
      createEllipse({ id: 'e', x: 0, y: 0, width: 100, height: 50 }),
      false,
    );
    expect(points).toContainEqual({ x: 50, y: 0 });
    expect(points).not.toContainEqual({ x: 0, y: 0 });
  });
});

describe('resolveSnap — point alignment', () => {
  it('pulls a near-aligned edge into line', () => {
    const result = dragAgainst(box(103, 200, 50, 50), [rect('a', 100, 0, 50, 50)]);
    expect(result.dx).toBe(-3);
    expect(result.dy).toBe(0);
  });

  it('leaves anything past the threshold alone', () => {
    const result = dragAgainst(box(180, 200, 50, 50), [rect('a', 100, 0, 50, 50)]);
    expect(result).toMatchObject({ dx: 0, dy: 0 });
    expect(result.guides).toEqual([]);
  });

  it('snaps each axis on its own evidence', () => {
    const result = dragAgainst(box(102, 297, 50, 50), [
      rect('a', 100, 0, 50, 50),
      rect('b', 500, 300, 50, 50),
    ]);
    expect(result.dx).toBe(-2);
    expect(result.dy).toBe(3);
  });

  it('draws a line through every point that agreed', () => {
    const result = dragAgainst(box(0, 203, 50, 50), [
      rect('a', 200, 200, 50, 50),
      rect('b', 400, 200, 50, 50),
    ]);
    expect(result.dy).toBe(-3);

    const line = result.guides.find((guide) => guide.kind === 'points');
    expect(line).toBeDefined();
    // Both neighbours' top-left corners, plus the dragged box's own.
    expect(line?.kind === 'points' && line.points.length).toBeGreaterThanOrEqual(3);
  });

  it('centres one shape on another', () => {
    // Centre at (127, 25) against a neighbour centred at (125, 25).
    const result = dragAgainst(box(102, 0, 50, 50), [rect('a', 100, 0, 50, 50)]);
    expect(result.dx).toBe(-2);
  });

  it('gains nothing from edge midpoints, which a box already implies', () => {
    // An edge centre sits on a coordinate its own corners and centre already
    // offer, so the extra points cannot move a box that the plain ones would
    // have left alone. They earn their keep in nearestTargetPoint instead.
    const neighbour = [rect('a', 0, 0, 200, 100)];
    const moving = box(300, 300, 40, 40);
    expect(dragAgainst(moving, neighbour).dx).toBe(
      dragAgainst(moving, neighbour, { midpoints: true }).dx,
    );
  });
});

describe('nearestTargetPoint', () => {
  const neighbour = [rect('a', 0, 0, 200, 100)];

  it('lands the point exactly on the nearest corner', () => {
    const result = nearestTargetPoint({ x: 197, y: 4 }, targetsFor(neighbour), 8);
    expect(result.dx).toBe(3);
    expect(result.dy).toBe(-4);
  });

  it('reaches the centre of an edge only when midpoints are wanted', () => {
    const point = { x: 103, y: 3 };
    expect(nearestTargetPoint(point, targetsFor(neighbour), 8)).toMatchObject({ dx: 0, dy: 0 });
    expect(nearestTargetPoint(point, targetsFor(neighbour, true), 8)).toMatchObject({
      dx: -3,
      dy: -3,
    });
  });

  it('marks the spot rather than claiming an alignment', () => {
    const result = nearestTargetPoint({ x: 3, y: 3 }, targetsFor(neighbour), 8);
    expect(result.guides).toEqual([{ kind: 'points', points: [{ x: 0, y: 0 }] }]);
  });

  it('measures as the crow flies, so a point diagonally away stays put', () => {
    // 6 from a corner on each axis: inside the threshold twice over, but 8.49
    // away in the only measure that matters here.
    expect(nearestTargetPoint({ x: 6, y: 6 }, targetsFor(neighbour), 8)).toMatchObject({
      dx: 0,
      dy: 0,
    });
  });
});

describe('gapsAlong', () => {
  it('measures the space between shapes that share a lane', () => {
    const gaps = gapsAlong([box(0, 0, 50, 50), box(150, 0, 50, 50)], 'x');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ start: 50, end: 150, length: 100 });
  });

  it('ignores pairs that never line up on the other axis', () => {
    expect(gapsAlong([box(0, 0, 50, 50), box(150, 500, 50, 50)], 'x')).toEqual([]);
  });

  it('ignores overlapping shapes, which have no gap between them', () => {
    expect(gapsAlong([box(0, 0, 50, 50), box(25, 0, 50, 50)], 'x')).toEqual([]);
  });
});

describe('resolveSnap — even spacing', () => {
  const pair = [rect('a', 0, 0, 50, 50), rect('b', 150, 0, 50, 50)];

  it('repeats an existing gap on the far side', () => {
    // A third box dropped near "one gap further along" lands exactly there.
    const result = dragAgainst(box(303, 0, 50, 50), pair);
    expect(result.dx).toBe(-3);
    expect(result.guides.some((guide) => guide.kind === 'gap')).toBe(true);
  });

  it('repeats it on the near side too', () => {
    // Mirror of the above: 50 wide, one gap of 100 to the left of shape a.
    const result = dragAgainst(box(-148, 0, 50, 50), pair);
    expect(result.dx).toBe(-2);
  });

  it('centres a shape inside a gap wider than itself', () => {
    // The 100-wide gap runs 50..150, so a 20-wide box centres at 90.
    const result = dragAgainst(box(93, 0, 20, 20), pair);
    expect(result.dx).toBe(-3);
  });

  it('shows the new span beside the one it copied', () => {
    const result = dragAgainst(box(303, 0, 50, 50), pair);
    const bars = result.guides.filter((guide) => guide.kind === 'gap');
    expect(bars).toHaveLength(2);
  });

  it('stays out of it when the shape is nowhere near the lane', () => {
    expect(dragAgainst(box(303, 900, 50, 50), pair).dx).toBe(0);
  });

  it('can be turned off for a gesture that cannot accept it', () => {
    const moving = box(303, 0, 50, 50);
    const result = resolveSnap({
      bounds: moving,
      points: dragSnapPoints([], moving, false),
      targets: targetsFor(pair),
      threshold: 8,
      gaps: false,
    });
    expect(result.dx).toBe(0);
  });
});

describe('resolveSnap — axis restrictions', () => {
  it('leaves an axis alone when the gesture is holding it still', () => {
    const moving = box(103, 203, 50, 50);
    const result = resolveSnap({
      bounds: moving,
      points: dragSnapPoints([], moving, false),
      targets: targetsFor([rect('a', 100, 200, 50, 50)]),
      threshold: 8,
      axes: { x: true, y: false },
    });
    expect(result.dx).toBe(-3);
    expect(result.dy).toBe(0);
  });
});

describe('resizeSnapPoints', () => {
  it('gives a corner handle one point and both axes', () => {
    const { points, axes } = resizeSnapPoints(box(0, 0, 100, 50), 4);
    expect(points).toEqual([{ x: 100, y: 50 }]);
    expect(axes).toEqual({ x: true, y: true });
  });

  it('gives a side handle the two corners it moves, on one axis', () => {
    const { points, axes } = resizeSnapPoints(box(0, 0, 100, 50), 3);
    expect(points).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
    expect(axes).toEqual({ x: true, y: false });
  });
});

describe('buildSnapTargets', () => {
  it('leaves out what is being moved', () => {
    const shapes = [rect('a', 0, 0, 50, 50), rect('b', 100, 0, 50, 50)];
    const targets = buildSnapTargets(shapes, new Set(['a']), WIDE_VIEW, { midpoints: false });
    expect(targets.points).toHaveLength(5);
    expect(targets.points).toContainEqual({ x: 100, y: 0 });
  });

  it('leaves out what is off screen', () => {
    const shapes = [rect('a', 0, 0, 50, 50), rect('far', 9_000, 9_000, 50, 50)];
    const targets = buildSnapTargets(shapes, new Set<string>(), box(-100, -100, 400, 400), {
      midpoints: false,
    });
    expect(targets.points).toHaveLength(5);
  });
});

describe('worldViewport', () => {
  it('covers less of the board the further in you zoom', () => {
    expect(worldViewport({ x: 10, y: 20, zoom: 2 }, 800, 600)).toEqual({
      x: 10,
      y: 20,
      width: 400,
      height: 300,
    });
  });
});

describe('guidesEqual', () => {
  it('spots a set of guides that would draw the same thing', () => {
    const a = dragAgainst(box(103, 200, 50, 50), [rect('a', 100, 0, 50, 50)]).guides;
    const b = dragAgainst(box(103, 200, 50, 50), [rect('a', 100, 0, 50, 50)]).guides;
    expect(guidesEqual(a, b)).toBe(true);
    expect(guidesEqual(a, [])).toBe(false);
  });
});
