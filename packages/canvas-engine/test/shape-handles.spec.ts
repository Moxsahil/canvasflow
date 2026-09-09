import { describe, expect, it } from 'vitest';
import { createArrow } from '../src/shapes/arrow.js';
import { createLine } from '../src/shapes/line.js';
import { createRectangle } from '../src/shapes/rectangle.js';
import {
  hasPointHandles,
  shapeHandleAt,
  shapeHandles,
  visibleShapeHandles,
  withHandlePointInserted,
  withHandlePointMoved,
  HANDLE_HIT_RADIUS,
} from '../src/shapes/handles.js';

const line = (points: ReadonlyArray<readonly [number, number]>, x = 0, y = 0) =>
  createLine({ id: 'line', x, y, points });

const arrow = (
  points: ReadonlyArray<readonly [number, number]>,
  arrowType: 'straight' | 'curved' | 'elbow' = 'straight',
) => createArrow({ id: 'arrow', x: 0, y: 0, points, arrowType });

describe('hasPointHandles', () => {
  it('is true for the shapes edited point by point', () => {
    expect(
      hasPointHandles(
        line([
          [0, 0],
          [100, 0],
        ]),
      ),
    ).toBe(true);
    expect(
      hasPointHandles(
        arrow([
          [0, 0],
          [100, 0],
        ]),
      ),
    ).toBe(true);
  });

  it('is false for the shapes edited by their box', () => {
    expect(hasPointHandles(createRectangle({ id: 'r', x: 0, y: 0, width: 10, height: 10 }))).toBe(
      false,
    );
  });
});

describe('shapeHandles', () => {
  it('returns null for a shape with no points to edit', () => {
    expect(
      shapeHandles(createRectangle({ id: 'r', x: 0, y: 0, width: 10, height: 10 })),
    ).toBeNull();
  });

  it('puts a vertex handle on every point, in world coordinates', () => {
    const handles = shapeHandles(
      line(
        [
          [0, 0],
          [100, 40],
        ],
        10,
        20,
      ),
    )!;
    expect(handles.filter((h) => h.type === 'vertex')).toEqual([
      { id: 'v0', type: 'vertex', index: 0, x: 10, y: 20 },
      { id: 'v1', type: 'vertex', index: 1, x: 110, y: 60 },
    ]);
  });

  it('offers a midpoint per segment, at the index it would insert', () => {
    const handles = shapeHandles(
      line([
        [0, 0],
        [100, 0],
        [100, 100],
      ]),
    )!;
    expect(handles.filter((h) => h.type !== 'vertex')).toEqual([
      { id: 'm0', type: 'create', index: 1, x: 50, y: 0 },
      { id: 'm1', type: 'create', index: 2, x: 100, y: 50 },
    ]);
  });

  it('shows a curved arrow its midpoint without waiting to be hovered', () => {
    const handles = shapeHandles(
      arrow(
        [
          [0, 0],
          [100, 0],
        ],
        'curved',
      ),
    )!;
    expect(handles.map((h) => h.type)).toEqual(['vertex', 'vertex', 'virtual']);
  });

  it('offers no midpoint on an elbow arrow, which is routed rather than drawn through its points', () => {
    const handles = shapeHandles(
      arrow(
        [
          [0, 0],
          [100, 100],
        ],
        'elbow',
      ),
    )!;
    expect(handles.every((h) => h.type === 'vertex')).toBe(true);
  });
});

describe('visibleShapeHandles', () => {
  it('drops a midpoint sitting under a vertex', () => {
    // Shorter than the two hit radii the midpoint would have to clear.
    const short = line([
      [0, 0],
      [HANDLE_HIT_RADIUS, 0],
    ]);
    expect(visibleShapeHandles(short, 1)!.every((h) => h.type === 'vertex')).toBe(true);
  });

  it('keeps it once the segment is long enough to tell them apart', () => {
    const long = line([
      [0, 0],
      [HANDLE_HIT_RADIUS * 8, 0],
    ]);
    expect(visibleShapeHandles(long, 1)!.some((h) => h.type === 'create')).toBe(true);
  });

  it('measures that distance in screen pixels, so zooming in separates them', () => {
    const short = line([
      [0, 0],
      [HANDLE_HIT_RADIUS, 0],
    ]);
    expect(visibleShapeHandles(short, 8)!.some((h) => h.type === 'create')).toBe(true);
  });
});

describe('shapeHandleAt', () => {
  const shape = line([
    [0, 0],
    [200, 0],
  ]);

  it('finds a handle the pointer is near but not on', () => {
    expect(shapeHandleAt(shape, 3, 4, 1)?.id).toBe('v0');
  });

  it('finds nothing beyond the grab radius', () => {
    expect(shapeHandleAt(shape, HANDLE_HIT_RADIUS + 1, 0, 1)).toBeNull();
  });

  it('prefers the point that exists over the one a drag would create', () => {
    // A midpoint handle would land on the far vertex of this three-point line;
    // the drag has to move that point rather than add another beside it.
    const bent = line([
      [0, 0],
      [200, 0],
      [200, 1],
    ]);
    expect(shapeHandleAt(bent, 200, 1, 1)?.type).toBe('vertex');
  });
});

describe('withHandlePointMoved', () => {
  it('moves the named point and leaves the rest', () => {
    const moved = withHandlePointMoved(
      line([
        [0, 0],
        [100, 0],
      ]),
      1,
      100,
      50,
    );
    expect(moved.points).toEqual([
      [0, 0],
      [100, 50],
    ]);
  });

  it('keeps the first point at the origin when it is the one that moved', () => {
    const moved = withHandlePointMoved(
      line(
        [
          [0, 0],
          [100, 0],
        ],
        10,
        10,
      ),
      0,
      0,
      0,
    );
    expect({ x: moved.x, y: moved.y, points: moved.points }).toEqual({
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [110, 10],
      ],
    });
  });
});

describe('withHandlePointInserted', () => {
  it('adds a point at the index without disturbing the others', () => {
    const bent = withHandlePointInserted(
      line([
        [0, 0],
        [100, 0],
      ]),
      1,
      50,
      0,
    );
    expect(bent.points).toEqual([
      [0, 0],
      [50, 0],
      [100, 0],
    ]);
  });
});
