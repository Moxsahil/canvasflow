import {
  pointSegmentDistance,
  segmentsDistance,
  segmentsIntersect,
  type Segment,
} from '../src/geometry/segment.js';
import { segmentErasesShape, shapesIntersectingSegment } from '../src/hit-testing/erase-test.js';
import { shapeContainsPoint, shapeHasSolidInterior } from '../src/shapes/outline.js';
import { SpatialIndex } from '../src/spatial/spatial-index.js';
import { createEllipse, createFreehand, createLine, createRectangle } from '../src/shapes/index.js';
import type { Shape } from '../src/shapes/shape.js';

const seg = (ax: number, ay: number, bx: number, by: number): Segment => [
  [ax, ay],
  [bx, by],
];

describe('segmentsIntersect', () => {
  it('detects a proper crossing', () => {
    expect(segmentsIntersect(seg(0, 0, 10, 10), seg(0, 10, 10, 0))).toBe(true);
  });

  it('rejects segments that miss', () => {
    expect(segmentsIntersect(seg(0, 0, 1, 1), seg(5, 5, 6, 6))).toBe(false);
    expect(segmentsIntersect(seg(0, 0, 10, 0), seg(0, 5, 10, 5))).toBe(false);
  });

  it('counts a touching endpoint', () => {
    expect(segmentsIntersect(seg(0, 0, 5, 0), seg(5, 0, 5, 5))).toBe(true);
  });

  it('counts collinear overlap but not collinear separation', () => {
    expect(segmentsIntersect(seg(0, 0, 10, 0), seg(5, 0, 15, 0))).toBe(true);
    expect(segmentsIntersect(seg(0, 0, 5, 0), seg(10, 0, 15, 0))).toBe(false);
  });
});

describe('distances', () => {
  it('clamps point distance to the segment ends', () => {
    // Perpendicular within the span.
    expect(pointSegmentDistance([5, 3], [0, 0], [10, 0])).toBeCloseTo(3);
    // Past the end, so it measures to the endpoint.
    expect(pointSegmentDistance([13, 4], [0, 0], [10, 0])).toBeCloseTo(5);
  });

  it('is zero for crossing segments', () => {
    expect(segmentsDistance(seg(0, 0, 10, 10), seg(0, 10, 10, 0))).toBe(0);
  });

  it('measures the closest approach of parallel segments', () => {
    expect(segmentsDistance(seg(0, 0, 10, 0), seg(0, 4, 10, 4))).toBeCloseTo(4);
  });
});

describe('shapeHasSolidInterior', () => {
  it('is false for an unfilled rectangle so its empty middle is not a target', () => {
    const outline = createRectangle({ id: 'r', x: 0, y: 0, width: 100, height: 100 });
    expect(shapeHasSolidInterior(outline)).toBe(false);

    const filled = createRectangle({
      id: 'r2',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fillColor: '#a5d8ff',
    });
    expect(shapeHasSolidInterior(filled)).toBe(true);
  });

  it('is never true for arrows', () => {
    const line = createLine({
      id: 'l',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [50, 0],
      ],
      fillColor: '#a5d8ff',
    });
    // Open line: filled but not a loop.
    expect(shapeHasSolidInterior(line)).toBe(false);
  });
});

describe('shapeContainsPoint', () => {
  it('respects the ellipse boundary rather than its bounding box', () => {
    const ellipse = createEllipse({ id: 'e', x: 0, y: 0, width: 100, height: 100 });
    expect(shapeContainsPoint(ellipse, 50, 50)).toBe(true);
    // Corner of the bounding box, well outside the ellipse itself.
    expect(shapeContainsPoint(ellipse, 2, 2)).toBe(false);
  });
});

describe('segmentErasesShape', () => {
  const rect = createRectangle({ id: 'r', x: 100, y: 100, width: 100, height: 100 });

  it('erases when the stroke crosses an edge', () => {
    expect(segmentErasesShape(seg(90, 150, 110, 150), rect, 1)).toBe(true);
  });

  it('leaves an unfilled shape alone when passing through the empty middle', () => {
    expect(segmentErasesShape(seg(140, 150, 160, 150), rect, 1)).toBe(false);
  });

  it('erases a filled shape from the inside', () => {
    const filled = createRectangle({
      id: 'f',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      fillColor: '#ffec99',
    });
    expect(segmentErasesShape(seg(140, 150, 160, 150), filled, 1)).toBe(true);
  });

  it('ignores a stroke that stays clear', () => {
    expect(segmentErasesShape(seg(0, 0, 20, 20), rect, 1)).toBe(false);
  });

  it('widens its reach as you zoom out', () => {
    const line = createLine({
      id: 'l',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [100, 0],
      ],
      strokeWidth: 1,
    });
    // 6px away: outside tolerance at 1x, inside once zoomed well out.
    expect(segmentErasesShape(seg(50, 6, 60, 6), line, 1)).toBe(false);
    expect(segmentErasesShape(seg(50, 6, 60, 6), line, 0.2)).toBe(true);
  });
});

describe('shapesIntersectingSegment', () => {
  function scene(shapes: Shape[]) {
    const index = new SpatialIndex();
    index.rebuild(shapes);
    return { shapes, index };
  }

  it('catches a shape a fast stroke jumps clean over', () => {
    // The gap between two pointer events straddles the whole shape — a point
    // test at either end would find nothing.
    const target = createRectangle({ id: 'target', x: 100, y: 0, width: 20, height: 200 });
    const { shapes, index } = scene([target]);

    expect(shapesIntersectingSegment(shapes, index, seg(0, 100, 300, 100), 1)).toEqual(['target']);
  });

  it('returns every shape along the stroke', () => {
    const a = createRectangle({ id: 'a', x: 0, y: 0, width: 20, height: 20 });
    const b = createRectangle({ id: 'b', x: 50, y: 0, width: 20, height: 20 });
    const far = createRectangle({ id: 'far', x: 0, y: 500, width: 20, height: 20 });
    const { shapes, index } = scene([a, b, far]);

    const hit = shapesIntersectingSegment(shapes, index, seg(-10, 10, 100, 10), 1);
    expect(hit).toEqual(['a', 'b']);
  });

  it('finds nothing on an empty stretch of canvas', () => {
    const { shapes, index } = scene([
      createRectangle({ id: 'a', x: 0, y: 0, width: 20, height: 20 }),
    ]);

    expect(shapesIntersectingSegment(shapes, index, seg(400, 400, 500, 500), 1)).toEqual([]);
  });

  it('erases a freehand stroke it passes near', () => {
    const stroke = createFreehand({
      id: 'fh',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [50, 50],
        [100, 0],
      ],
    });
    const { shapes, index } = scene([stroke]);

    expect(shapesIntersectingSegment(shapes, index, seg(25, 20, 25, 30), 1)).toEqual(['fh']);
  });
});
