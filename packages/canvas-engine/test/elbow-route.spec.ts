import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../src/math.js';
import {
  createArrow,
  createRectangle,
  elbowBindingAt,
  elbowRouteTouches,
  HEADING_LEFT,
  HEADING_RIGHT,
  HEADING_UP,
  isUnroutedElbow,
  routeElbow,
  shapeHandles,
  withElbowRoute,
  withFixedRouteEnds,
  withSegmentMoved,
  type ElbowEnd,
} from '../src/shapes/index.js';
import type { Shape } from '../src/shapes/shape.js';
import { arrowBendJoins, roundedPolylinePath } from '../src/utils/rough.js';

/** The source box: 100 × 50 at the origin; its right side's middle is (100, 25). */
const box: Rect = { x: 0, y: 0, width: 100, height: 50 };
const fromRight: ElbowEnd = { point: { x: 100, y: 25 }, outward: HEADING_RIGHT, box };
const free = (x: number, y: number): ElbowEnd => ({ point: { x, y }, outward: null, box: null });

/** Every run level or upright. */
function orthogonal(route: readonly Point[]): boolean {
  return route.every(
    (p, i) =>
      i === 0 || Math.abs(p.x - route[i - 1]!.x) < 1e-6 || Math.abs(p.y - route[i - 1]!.y) < 1e-6,
  );
}

/** Whether any run passes through the inside of `r`. */
function crosses(route: readonly Point[], r: Rect): boolean {
  for (let i = 1; i < route.length; i += 1) {
    const a = route[i - 1]!;
    const b = route[i]!;
    for (let t = 0.02; t < 1; t += 0.02) {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height) return true;
    }
  }
  return false;
}

describe('routeElbow', () => {
  it('goes straight while the end is level with the start', () => {
    expect(routeElbow(fromRight, free(300, 25))).toEqual([
      { x: 100, y: 25 },
      { x: 300, y: 25 },
    ]);
  });

  it('steps across half way when the end is pulled down and further on', () => {
    const route = routeElbow(fromRight, free(400, 100));
    expect(orthogonal(route)).toBe(true);
    // Out level, down, and on level again: a Z, turning in the middle.
    expect(route).toHaveLength(4);
    expect(route[1]!.y).toBe(25);
    expect(route[2]!.y).toBe(100);
    expect(route[3]).toEqual({ x: 400, y: 100 });
  });

  it('turns once to come down onto an end that is mostly below', () => {
    const route = routeElbow(fromRight, free(180, 300));
    expect(orthogonal(route)).toBe(true);
    expect(route).toEqual([
      { x: 100, y: 25 },
      { x: 180, y: 25 },
      { x: 180, y: 300 },
    ]);
  });

  it('goes round its own shape to reach an end behind it', () => {
    const route = routeElbow(fromRight, free(-200, 25));
    expect(orthogonal(route)).toBe(true);
    expect(route[1]!.x).toBeGreaterThan(100);
    expect(crosses(route, box)).toBe(false);
    expect(route[route.length - 1]).toEqual({ x: -200, y: 25 });
  });

  it('comes into a side square to it', () => {
    const target: Rect = { x: 300, y: 200, width: 100, height: 50 };
    const route = routeElbow(fromRight, {
      point: { x: 300, y: 225 },
      outward: HEADING_LEFT,
      box: target,
    });
    expect(orthogonal(route)).toBe(true);
    const last = route[route.length - 1]!;
    const before = route[route.length - 2]!;
    expect(last).toEqual({ x: 300, y: 225 });
    // The final run is level, heading right into the left side.
    expect(before.y).toBe(225);
    expect(before.x).toBeLessThan(300);
  });

  it('goes round a shape in the way instead of through it', () => {
    const wall: Rect = { x: 200, y: -100, width: 40, height: 250 };
    const route = routeElbow(fromRight, free(400, 25), [wall]);
    expect(orthogonal(route)).toBe(true);
    expect(crosses(route, wall)).toBe(false);
  });

  it('goes over a side to a top that faces up', () => {
    const target: Rect = { x: 300, y: 300, width: 100, height: 50 };
    const route = routeElbow(fromRight, {
      point: { x: 350, y: 300 },
      outward: HEADING_UP,
      box: target,
    });
    expect(orthogonal(route)).toBe(true);
    expect(route).toHaveLength(3);
    expect(route[1]).toEqual({ x: 350, y: 25 });
  });
});

describe('withElbowRoute', () => {
  const rect = (id: string, x: number, y: number, width = 150, height = 60): Shape =>
    createRectangle({ id, x, y, width, height, seed: 1 });

  it('keeps clear of the boxes between the ends on a real board', () => {
    // The board this was reported on: an elbow arrow out of "user", ending
    // below two boxes standing in a column to its right.
    const user = rect('user', 0, 0);
    const checkout = rect('checkout', 300, -20, 150, 100);
    const order = rect('order', 300, 140, 150, 60);
    const arrow = createArrow({
      id: 'a',
      x: 150,
      y: 30,
      points: [
        [0, 0],
        [230, 320],
      ],
      arrowType: 'elbow',
      startBinding: { shapeId: 'user', anchor: { x: 1, y: 0.5 }, precise: true },
    });
    const byId = new Map<string, Shape>([user, checkout, order, arrow].map((s) => [s.id, s]));
    const routed = withElbowRoute(arrow, byId);
    const route = routed.points.map(([x, y]) => ({ x: routed.x + x, y: routed.y + y }));
    expect(orthogonal(route)).toBe(true);
    expect(crosses(route, { x: 300, y: -20, width: 150, height: 100 })).toBe(false);
    expect(crosses(route, { x: 300, y: 140, width: 150, height: 60 })).toBe(false);
    expect(route[0]!.x).toBeGreaterThanOrEqual(150);
    expect(route[0]!.y).toBeCloseTo(30);
  });

  it('knows an elbow arrow stored before routing', () => {
    const old = createArrow({
      id: 'old',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [100, 80],
      ],
      arrowType: 'elbow',
    });
    expect(isUnroutedElbow(old)).toBe(true);
    expect(
      isUnroutedElbow({
        ...old,
        points: [
          [0, 0],
          [100, 0],
        ],
      }),
    ).toBe(false);
    expect(isUnroutedElbow({ ...old, arrowType: 'straight' })).toBe(false);
  });
});

describe('elbowBindingAt', () => {
  const target = createRectangle({ id: 't', x: 0, y: 0, width: 200, height: 100, seed: 1 });

  it('takes the side an end is let go near, at its middle', () => {
    expect(elbowBindingAt(target, { x: 4, y: 20 }, { x: -300, y: 0 }, 12).anchor).toEqual({
      x: 0,
      y: 0.5,
    });
  });

  it('takes the side facing the other end when let go in the middle', () => {
    expect(elbowBindingAt(target, { x: 100, y: 50 }, { x: 100, y: 600 }, 12).anchor).toEqual({
      x: 0.5,
      y: 1,
    });
  });
});

describe('a route shaped by hand', () => {
  const left = createRectangle({ id: 'l', x: 0, y: 0, width: 100, height: 50, seed: 1 });
  const right = createRectangle({ id: 'r', x: 400, y: 200, width: 100, height: 50, seed: 1 });
  const zArrow = () => {
    const byId = new Map<string, Shape>([left, right].map((s) => [s.id, s]));
    const arrow = createArrow({
      id: 'z',
      x: 100,
      y: 25,
      points: [
        [0, 0],
        [300, 200],
      ],
      arrowType: 'elbow',
      endArrowhead: 'none',
      startBinding: { shapeId: 'l', anchor: { x: 1, y: 0.5 }, precise: true },
      endBinding: { shapeId: 'r', anchor: { x: 0, y: 0.5 }, precise: true },
    });
    const routed = withElbowRoute(arrow, byId);
    byId.set(routed.id, routed);
    return { routed, byId };
  };
  const absolute = (arrow: {
    x: number;
    y: number;
    points: ReadonlyArray<readonly [number, number]>;
  }) => arrow.points.map(([x, y]) => ({ x: arrow.x + x, y: arrow.y + y }));

  it('offers the middle run of a Z to slide, and not the runs at its ends', () => {
    const { routed } = zArrow();
    expect(routed.points).toHaveLength(4);
    const segments = shapeHandles(routed)!.filter((h) => h.type === 'segment');
    expect(segments.map((h) => h.index)).toEqual([1]);
  });

  it('slides a run across, bends and all', () => {
    const { routed } = zArrow();
    const slid = withSegmentMoved(routed, 1, 60, 999);
    const before = absolute(routed);
    const after = absolute(slid);
    expect(after[1]!.x).toBeCloseTo(before[1]!.x + 60);
    expect(after[2]!.x).toBeCloseTo(before[2]!.x + 60);
    expect(after[1]!.y).toBeCloseTo(before[1]!.y);
    expect(after[0]).toEqual(before[0]);
  });

  it('keeps the slid run where it was put when an attached shape moves', () => {
    const { routed, byId } = zArrow();
    const slid = { ...withSegmentMoved(routed, 1, 60, 0), routeFixed: true };
    byId.set(slid.id, slid);
    byId.set('r', { ...right, y: 260 });
    const kept = withFixedRouteEnds(slid, byId);
    expect(kept.routeFixed).toBe(true);
    const points = absolute(kept);
    expect(points[1]!.x).toBeCloseTo(absolute(slid)[1]!.x);
    expect(points[3]!.y).toBeCloseTo(285);
    expect(points[2]!.y).toBeCloseTo(285);
  });

  it('is routed afresh when an end goes round behind its own run', () => {
    const { routed, byId } = zArrow();
    const slid = { ...withSegmentMoved(routed, 1, 60, 0), routeFixed: true };
    byId.set(slid.id, slid);
    byId.set('r', { ...right, x: -400 });
    const fresh = withFixedRouteEnds(slid, byId);
    expect(fresh.routeFixed).toBe(false);
  });
});

describe('elbowRouteTouches', () => {
  it('says whether a box sits on any run', () => {
    const arrow = createArrow({
      id: 'a',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      arrowType: 'elbow',
    });
    expect(elbowRouteTouches(arrow, [{ x: 90, y: 40, width: 20, height: 20 }])).toBe(true);
    expect(elbowRouteTouches(arrow, [{ x: 20, y: 40, width: 20, height: 20 }])).toBe(false);
  });
});

describe('roundedPolylinePath', () => {
  it('rounds each bend and leaves both ends where they are', () => {
    const d = roundedPolylinePath(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      16,
    );
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('L 84 0');
    expect(d).toContain('Q 100 0 100 16');
    expect(d.endsWith('L 100 100')).toBe(true);
  });

  it('never rounds a bend past half of a run it shares', () => {
    const d = roundedPolylinePath(
      [
        [0, 0],
        [100, 0],
        [100, 10],
        [200, 10],
      ],
      16,
    );
    expect(d).toContain('Q 100 0 100 5');
  });
});

describe('arrowBendJoins', () => {
  const bent = createArrow({
    id: 'b',
    x: 0,
    y: 0,
    points: [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
    arrowType: 'elbow',
    strokeWidth: 4,
  });

  it('fills the outside of a right-angled bend with a square the stroke wide', () => {
    const joins = arrowBendJoins(bent);
    expect(joins).toHaveLength(1);
    expect(joins[0]).toMatchObject({ kind: 'square', x: 100, y: 0 });
    expect(joins[0]!.size).toBeGreaterThan(0);
  });

  it('leaves rounded bends and dashed lines alone', () => {
    expect(arrowBendJoins({ ...bent, edges: 'round' })).toEqual([]);
    expect(arrowBendJoins({ ...bent, strokeStyle: 'dashed' })).toEqual([]);
  });
});
