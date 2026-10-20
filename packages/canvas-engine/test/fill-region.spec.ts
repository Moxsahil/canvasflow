import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../src/geometry/segment.js';
import { pointSegmentDistance } from '../src/geometry/segment.js';
import {
  computeFillRegion,
  fillPolygonPoints,
  isFillPaint,
  isRestylableFill,
  type FillRegionResult,
} from '../src/fill/fill-region.js';
import { createArrow } from '../src/shapes/arrow.js';
import { createDiamond } from '../src/shapes/diamond.js';
import { createEllipse } from '../src/shapes/ellipse.js';
import { createFreehand } from '../src/shapes/freehand.js';
import { createLine } from '../src/shapes/line.js';
import { createRectangle } from '../src/shapes/rectangle.js';
import type { LineShape, Shape } from '../src/shapes/shape.js';

const rect = (id: string, x: number, y: number, width: number, height: number, extra = {}) =>
  createRectangle({ id, x, y, width, height, seed: 1, ...extra });

/** An open line through absolute points. */
const line = (id: string, points: Vec2[], extra = {}) =>
  createLine({
    id,
    x: points[0]![0],
    y: points[0]![1],
    points: points.map(([px, py]) => [px - points[0]![0], py - points[0]![1]] as const),
    seed: 1,
    ...extra,
  });

/** Absolute area, by the shoelace formula. */
function area(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += points[j]![0] * points[i]![1] - points[i]![0] * points[j]![1];
  }
  return Math.abs(sum / 2);
}

/** Even-odd containment — how a fill is painted. */
function paints(points: readonly Vec2[], [x, y]: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Nonzero containment — how the SVG export paints a fill, which carries no
 * fill rule of its own.
 */
function paintsNonZero(points: readonly Vec2[], [x, y]: Vec2): boolean {
  let winding = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [x1, y1] = points[j]!;
    const [x2, y2] = points[i]!;
    const side = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
    if (y1 <= y) {
      if (y2 > y && side > 0) winding++;
    } else if (y2 <= y && side < 0) {
      winding--;
    }
  }
  return winding !== 0;
}

const isClosed = (points: readonly Vec2[]): boolean =>
  points.length > 3 &&
  points[0]![0] === points[points.length - 1]![0] &&
  points[0]![1] === points[points.length - 1]![1];

function expectFill(result: FillRegionResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`no fill: ${result.reason}`);
  return result;
}

/** The fill the editor would make from a result, so a second click sees it. */
const fillPaint = (id: string, points: readonly Vec2[], extra = {}): LineShape =>
  createLine({
    id,
    ...fillPolygonPoints(points),
    fillColor: '#ffc9c9',
    fillStyle: 'solid',
    strokeColor: 'transparent',
    roughness: 0,
    seed: 1,
    ...extra,
  });

/** The board with `shape` placed where the result says. */
function placeFill(
  shapes: Shape[],
  shape: Shape,
  result: Extract<FillRegionResult, { ok: true }>,
): Shape[] {
  const anchor = shapes.findIndex((s) => s.id === result.placement.shapeId);
  const index = result.placement.placement === 'above' ? anchor + 1 : anchor;
  return [...shapes.slice(0, index), shape, ...shapes.slice(index)];
}

/** A closed square stroke drawn as dense freehand input, ending `gap` short of its start. */
function freehandSquare(id: string, size: number, gap: number, extra = {}) {
  const points: Array<readonly [number, number]> = [];
  const corners: Vec2[] = [
    [0, 0],
    [size, 0],
    [size, size],
    [0, size],
    [0, gap],
  ];
  for (let c = 0; c < corners.length - 1; c++) {
    const [ax, ay] = corners[c]!;
    const [bx, by] = corners[c + 1]!;
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 10);
    for (let s = 0; s < steps; s++) {
      points.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
    }
  }
  points.push([0, gap]);
  return createFreehand({ id, x: 0, y: 0, points, seed: 1, ...extra });
}

describe('computeFillRegion', () => {
  describe('single shapes', () => {
    it('fills a rectangle with a closed polygon, placed below it', () => {
      const r = rect('r', 0, 0, 100, 100);
      const result = expectFill(computeFillRegion({ point: [50, 50], shapes: [r] }));
      expect(result.ownerId).toBe('r');
      expect(result.boundaryIds).toEqual([]);
      expect(result.placement).toEqual({ placement: 'below', shapeId: 'r' });
      expect(isClosed(result.points)).toBe(true);
      expect(area(result.points)).toBeCloseTo(10000, -1);
    });

    it('follows rounded corners', () => {
      const r = rect('r', 0, 0, 100, 100, { edges: 'round' });
      const result = expectFill(computeFillRegion({ point: [50, 50], shapes: [r] }));
      expect(area(result.points)).toBeLessThan(9990);
      expect(area(result.points)).toBeGreaterThan(9000);
    });

    it('fills an ellipse with a bounded point count', () => {
      const e = createEllipse({ id: 'e', x: 0, y: 0, width: 100, height: 100, seed: 1 });
      const result = expectFill(computeFillRegion({ point: [50, 50], shapes: [e] }));
      expect(area(result.points)).toBeGreaterThan(7000);
      expect(area(result.points)).toBeLessThan(7900);
      expect(result.points.length).toBeLessThanOrEqual(64);
      expect(result.points.length).toBeGreaterThan(6);
    });

    it('fills a diamond', () => {
      const d = createDiamond({ id: 'd', x: 0, y: 0, width: 200, height: 150, seed: 1 });
      const result = expectFill(computeFillRegion({ point: [100, 75], shapes: [d] }));
      expect(area(result.points)).toBeCloseTo(15000, -2);
    });

    it('fills a filled line, whose stroke closes as a polygon', () => {
      const triangle = line(
        't',
        [
          [0, 100],
          [50, 0],
          [100, 100],
        ],
        { fillColor: '#a5d8ff' },
      );
      const result = expectFill(computeFillRegion({ point: [50, 70], shapes: [triangle] }));
      expect(area(result.points)).toBeCloseTo(5000, -2);
    });

    it('does not fill an open, unfilled line', () => {
      const vee = line('v', [
        [0, 100],
        [50, 0],
        [100, 100],
      ]);
      const result = computeFillRegion({ point: [50, 70], shapes: [vee] });
      expect(result).toEqual({ ok: false, reason: 'no_owner' });
    });

    it('fills a curved line along the curve the renderer draws', () => {
      const points: Vec2[] = [
        [0, 50],
        [35, 0],
        [100, 20],
        [90, 80],
        [30, 100],
        [0, 50],
      ];
      const blob = line('b', points, { edges: 'round' });
      const result = expectFill(computeFillRegion({ point: [50, 50], shapes: [blob] }));
      // The curve bulges away from the straight chords between the points; a
      // fill along the chords would keep every vertex within a unit of them.
      const deviation = Math.max(
        ...result.points.map((vertex) =>
          Math.min(...points.slice(1).map((p, i) => pointSegmentDistance(vertex, points[i]!, p))),
        ),
      );
      expect(deviation).toBeGreaterThan(2);
    });

    it('fills a freehand loop whose ends stop a little short', () => {
      const result = expectFill(
        computeFillRegion({ point: [50, 50], shapes: [freehandSquare('f', 100, 5)] }),
      );
      expect(isClosed(result.points)).toBe(true);
      expect(area(result.points)).toBeCloseTo(10000, -3);
    });

    it('fills an exactly closed freehand loop drawn with sharp edges', () => {
      const f = freehandSquare('f', 100, 0, { edges: 'sharp' });
      const result = expectFill(computeFillRegion({ point: [50, 50], shapes: [f] }));
      expect(area(result.points)).toBeCloseTo(10000, -2);
    });
  });

  describe('overlapping outlines', () => {
    const below = rect('below', 0, 0, 100, 100);
    const top = rect('top', 50, 50, 100, 100);

    it('fills just the overlap of two shapes', () => {
      const result = expectFill(computeFillRegion({ point: [75, 75], shapes: [below, top] }));
      expect(result.ownerId).toBe('top');
      expect(result.boundaryIds).toContain('below');
      expect(result.placement).toEqual({ placement: 'below', shapeId: 'below' });
      expect(area(result.points)).toBeCloseTo(2500, -1);
    });

    it('fills the shape minus the overlap outside it', () => {
      const result = expectFill(computeFillRegion({ point: [125, 125], shapes: [below, top] }));
      expect(area(result.points)).toBeCloseTo(7500, -1);
    });

    it('ignores outlines hidden under a solid fill above them', () => {
      const solidTop = rect('top', 50, 50, 100, 100, { fillColor: '#ffec99', fillStyle: 'solid' });
      const result = expectFill(computeFillRegion({ point: [75, 75], shapes: [below, solidTop] }));
      expect(area(result.points)).toBeCloseTo(10000, -1);
      // Above the solid shape it fills, or its own paint would hide the fill.
      expect(result.placement).toEqual({ placement: 'above', shapeId: 'top' });
    });

    it('keeps outlines that show through a hatched fill', () => {
      const hatched = rect('top', 50, 50, 100, 100, { fillColor: '#ffec99', fillStyle: 'hachure' });
      const result = expectFill(computeFillRegion({ point: [75, 75], shapes: [below, hatched] }));
      expect(area(result.points)).toBeCloseTo(2500, -1);
    });

    it('keeps outlines that show through a see-through shape', () => {
      const faded = rect('top', 50, 50, 100, 100, {
        fillColor: '#ffec99',
        fillStyle: 'solid',
        opacity: 50,
      });
      const result = expectFill(computeFillRegion({ point: [75, 75], shapes: [below, faded] }));
      expect(area(result.points)).toBeCloseTo(2500, -1);
    });

    it('does not let an arrow divide an area', () => {
      const arrow = createArrow({
        id: 'a',
        x: -20,
        y: 50,
        points: [
          [0, 0],
          [140, 0],
        ],
        seed: 1,
      });
      const result = expectFill(computeFillRegion({ point: [50, 25], shapes: [below, arrow] }));
      expect(area(result.points)).toBeCloseTo(10000, -1);
    });
  });

  describe('areas formed by open lines', () => {
    // A noughts-and-crosses grid: the middle square is closed only by
    // four open lines crossing each other.
    const grid = [
      line('h1', [
        [0, 100],
        [300, 100],
      ]),
      line('h2', [
        [0, 200],
        [300, 200],
      ]),
      line('v1', [
        [100, 0],
        [100, 300],
      ]),
      line('v2', [
        [200, 0],
        [200, 300],
      ]),
    ];

    it('fills an area no single shape encloses', () => {
      const result = expectFill(computeFillRegion({ point: [150, 150], shapes: grid }));
      expect(result.ownerId).toBeNull();
      expect(new Set(result.boundaryIds)).toEqual(new Set(['h1', 'h2', 'v1', 'v2']));
      expect(area(result.points)).toBeCloseTo(10000, -1);
    });

    it('fills a loop made by one line crossing itself', () => {
      const loop = line('l', [
        [0, 0],
        [100, 0],
        [100, 100],
        [50, 100],
        [50, -50],
      ]);
      const result = expectFill(computeFillRegion({ point: [75, 50], shapes: [loop] }));
      expect(area(result.points)).toBeCloseTo(5000, -1);
    });

    it('fills an area closed by a line against the outside of a shape', () => {
      const r = rect('r', 0, 0, 100, 100);
      const hook = line('h', [
        [100, 20],
        [160, 20],
        [160, 80],
        [100, 80],
      ]);
      const result = expectFill(computeFillRegion({ point: [130, 50], shapes: [r, hook] }));
      expect(area(result.points)).toBeCloseTo(3600, -1);
    });

    it('bridges gaps up to the tolerance without moving the outline', () => {
      const gap = 4;
      const sides = [
        line('top', [
          [0, 0],
          [100 - gap, 0],
        ]),
        line('right', [
          [100, 0],
          [100, 100 - gap],
        ]),
        line('bottom', [
          [100, 100],
          [gap, 100],
        ]),
        line('left', [
          [0, 100],
          [0, gap],
        ]),
      ];
      const result = expectFill(computeFillRegion({ point: [50, 50], shapes: sides }));
      expect(area(result.points)).toBeGreaterThan(9900);
      expect(area(result.points)).toBeLessThanOrEqual(10000);
      for (const [x, y] of result.points) {
        expect(Math.min(x, 100 - x, y, 100 - y)).toBeLessThan(0.75);
      }
    });

    it('leaves gaps wider than the tolerance open', () => {
      const gap = 12;
      const sides = [
        line('top', [
          [0, 0],
          [100 - gap, 0],
        ]),
        line('right', [
          [100, 0],
          [100, 100 - gap],
        ]),
        line('bottom', [
          [100, 100],
          [gap, 100],
        ]),
        line('left', [
          [0, 100],
          [0, gap],
        ]),
      ];
      expect(computeFillRegion({ point: [50, 50], shapes: sides })).toEqual({
        ok: false,
        reason: 'no_owner',
      });
    });

    it('keeps searching past an empty first box', () => {
      const big = [
        line('top', [
          [-1200, -1200],
          [1200, -1200],
        ]),
        line('right', [
          [1200, -1200],
          [1200, 1200],
        ]),
        line('bottom', [
          [1200, 1200],
          [-1200, 1200],
        ]),
        line('left', [
          [-1200, 1200],
          [-1200, -1200],
        ]),
      ];
      const result = expectFill(computeFillRegion({ point: [0, 0], shapes: big }));
      expect(area(result.points)).toBeCloseTo(2400 * 2400, -2);
    });
  });

  describe('nothing to fill', () => {
    it('is quiet on an empty board', () => {
      expect(computeFillRegion({ point: [0, 0], shapes: [] })).toEqual({
        ok: false,
        reason: 'no_owner',
      });
    });

    it('is quiet outside every shape', () => {
      const result = computeFillRegion({ point: [500, 500], shapes: [rect('r', 0, 0, 100, 100)] });
      expect(result).toEqual({ ok: false, reason: 'no_owner' });
    });

    it('ignores a shape that paints nothing', () => {
      const ghost = rect('g', 0, 0, 100, 100, { strokeColor: 'transparent' });
      expect(computeFillRegion({ point: [50, 50], shapes: [ghost] })).toEqual({
        ok: false,
        reason: 'no_owner',
      });
    });

    it('ignores hidden shapes', () => {
      const hidden = { ...rect('h', 0, 0, 100, 100), hidden: true };
      expect(computeFillRegion({ point: [50, 50], shapes: [hidden] })).toEqual({
        ok: false,
        reason: 'no_owner',
      });
    });

    it('gives up as too complex over the segment budget', () => {
      const e = createEllipse({ id: 'e', x: 0, y: 0, width: 100, height: 100, seed: 1 });
      expect(
        computeFillRegion({ point: [50, 50], shapes: [e], options: { maxBoundarySegments: 10 } }),
      ).toEqual({ ok: false, reason: 'too_complex' });
    });
  });

  describe('earlier fills', () => {
    it('never own a fill, and are recognised for recolouring', () => {
      const r = rect('r', 0, 0, 100, 100);
      const first = expectFill(computeFillRegion({ point: [50, 50], shapes: [r] }));
      const paint = fillPaint('paint', first.points);
      expect(isFillPaint(paint)).toBe(true);
      const shapes = placeFill([r], paint, first);

      const second = expectFill(computeFillRegion({ point: [50, 50], shapes }));
      expect(second.ownerId).toBe('r');
      expect(isRestylableFill(paint, second.points)).toBe(true);
    });

    it('a fill since divided by a new stroke is not recoloured whole', () => {
      const r = rect('r', 0, 0, 100, 100);
      const first = expectFill(computeFillRegion({ point: [50, 50], shapes: [r] }));
      const paint = fillPaint('paint', first.points);
      const divider = line('d', [
        [50, 0],
        [50, 100],
      ]);
      const shapes = [...placeFill([r], paint, first), divider];

      const second = expectFill(computeFillRegion({ point: [25, 50], shapes }));
      expect(area(second.points)).toBeCloseTo(5000, -1);
      expect(isRestylableFill(paint, second.points)).toBe(false);
    });

    it('a solid fill hides the strokes beneath it from new fills', () => {
      // The line would split the rectangle in two, but it lies under a solid
      // fill, so nobody can see it. Bottom to top: line, fill, rectangle.
      const buried = line('buried', [
        [-5, 50],
        [105, 50],
      ]);
      const cover = fillPaint('cover', [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ]);
      const r = rect('r', 0, 0, 100, 100);
      const result = expectFill(computeFillRegion({ point: [50, 25], shapes: [buried, cover, r] }));
      expect(area(result.points)).toBeCloseTo(10000, -2);
      expect(result.boundaryIds).not.toContain('buried');
      expect(result.placement).toEqual({ placement: 'above', shapeId: 'cover' });
    });

    it('a fill does not hide the strokes that bound it from the next fill', () => {
      const r = rect('r', 0, 0, 100, 100);
      const divider = line('d', [
        [50, 0],
        [50, 100],
      ]);
      const first = expectFill(computeFillRegion({ point: [25, 50], shapes: [r, divider] }));
      const shapes = placeFill([r, divider], fillPaint('left', first.points), first);
      const second = expectFill(computeFillRegion({ point: [75, 50], shapes }));
      expect(area(second.points)).toBeCloseTo(5000, -1);
    });

    it('a fill given a visible stroke bounds new fills', () => {
      const r = rect('r', 0, 0, 100, 100);
      const outlined = fillPaint(
        'paint',
        [
          [0, 0],
          [50, 0],
          [50, 100],
          [0, 100],
          [0, 0],
        ],
        { strokeColor: '#1e1e1e', fillStyle: 'hachure' },
      );
      expect(isFillPaint(outlined)).toBe(false);
      const result = expectFill(computeFillRegion({ point: [75, 50], shapes: [r, outlined] }));
      expect(area(result.points)).toBeCloseTo(5000, -1);
    });
  });

  describe('layer order', () => {
    it('goes below a mark lying inside the area', () => {
      const r = rect('r', 0, 0, 200, 200);
      const squiggle = line('s', [
        [60, 100],
        [80, 90],
        [100, 110],
      ]);
      const result = expectFill(computeFillRegion({ point: [20, 20], shapes: [squiggle, r] }));
      expect(result.placement).toEqual({ placement: 'below', shapeId: 's' });
    });

    it('goes above a solid shape overlapping the area away from the click', () => {
      const r = rect('r', 0, 0, 200, 200);
      const sticker = rect('s', 150, 150, 100, 100, { fillColor: '#b2f2bb', fillStyle: 'solid' });
      const result = expectFill(computeFillRegion({ point: [20, 20], shapes: [sticker, r] }));
      expect(result.placement).toEqual({ placement: 'above', shapeId: 's' });
    });
  });

  describe('islands', () => {
    const outer = rect('outer', 0, 0, 200, 200);
    const island = rect('island', 50, 50, 100, 100);

    it('leaves a hole for an outline inside the area', () => {
      const result = expectFill(computeFillRegion({ point: [20, 20], shapes: [outer, island] }));
      expect(area(result.points)).toBeCloseTo(30000, -1);
      expect(paints(result.points, [20, 20])).toBe(true);
      expect(paints(result.points, [100, 100])).toBe(false);
      // Wound the other way round, so the hole stays empty under either rule.
      expect(paintsNonZero(result.points, [20, 20])).toBe(true);
      expect(paintsNonZero(result.points, [100, 100])).toBe(false);
      expect(result.boundaryIds).toContain('island');
    });

    it('fills just the island when clicked inside it', () => {
      const result = expectFill(computeFillRegion({ point: [100, 100], shapes: [outer, island] }));
      expect(area(result.points)).toBeCloseTo(10000, -1);
    });

    it('leaves out only the outermost islands', () => {
      const big = rect('outer', 0, 0, 300, 300);
      const middle = rect('middle', 50, 50, 200, 200);
      const inner = rect('inner', 100, 100, 100, 100);
      const result = expectFill(
        computeFillRegion({ point: [20, 20], shapes: [big, middle, inner] }),
      );
      expect(area(result.points)).toBeCloseTo(90000 - 40000, -1);
      expect(paints(result.points, [150, 150])).toBe(false);
    });

    it('leaves a hole for each of several islands', () => {
      const a = rect('a', 20, 20, 40, 40);
      const b = rect('b', 120, 120, 40, 40);
      const result = expectFill(computeFillRegion({ point: [100, 10], shapes: [outer, a, b] }));
      expect(area(result.points)).toBeCloseTo(40000 - 1600 - 1600, -1);
      expect(paints(result.points, [40, 40])).toBe(false);
      expect(paints(result.points, [140, 140])).toBe(false);
    });

    it('an open line inside does not make a hole', () => {
      const stroke = line('s', [
        [50, 100],
        [150, 100],
      ]);
      const result = expectFill(computeFillRegion({ point: [20, 20], shapes: [outer, stroke] }));
      expect(area(result.points)).toBeCloseTo(40000, -1);
    });
  });

  it('fillPolygonPoints stores the ring relative to its first point', () => {
    const ring: Vec2[] = [
      [10, 20],
      [110, 20],
      [110, 120],
      [10, 20],
    ];
    expect(fillPolygonPoints(ring)).toEqual({
      x: 10,
      y: 20,
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 0],
      ],
    });
  });
});
