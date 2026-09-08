import { describe, expect, it } from 'vitest';
import { createArrow } from '../src/shapes/arrow.js';
import { createEllipse } from '../src/shapes/ellipse.js';
import { createRectangle } from '../src/shapes/rectangle.js';
import type { Shape } from '../src/shapes/shape.js';
import {
  arrowsAffectedBy,
  bindingFor,
  bindingTargetAt,
  boundArrowPatches,
  canBindTo,
  normalizedAnchorFor,
  resolveArrowTerminals,
  withBindingsCleared,
  BOUND_ARROW_GAP,
} from '../src/shapes/arrow-binding.js';

const box = (id: string, x: number, y: number, width = 100, height = 100): Shape =>
  createRectangle({ id, x, y, width, height });

const arrowBetween = (
  from: readonly [number, number],
  to: readonly [number, number],
  bindings: { start?: string; end?: string; precise?: boolean } = {},
) =>
  createArrow({
    id: 'arrow',
    x: from[0],
    y: from[1],
    points: [
      [0, 0],
      [to[0] - from[0], to[1] - from[1]],
    ],
    startBinding: bindings.start
      ? { shapeId: bindings.start, anchor: { x: 0.5, y: 0.5 }, precise: bindings.precise ?? false }
      : null,
    endBinding: bindings.end
      ? { shapeId: bindings.end, anchor: { x: 0.5, y: 0.5 }, precise: bindings.precise ?? false }
      : null,
  });

const mapOf = (...shapes: Shape[]) => new Map(shapes.map((shape) => [shape.id, shape]));

describe('canBindTo', () => {
  it('takes the closed kinds and refuses the linear ones', () => {
    expect(canBindTo(box('a', 0, 0))).toBe(true);
    expect(canBindTo(createEllipse({ id: 'e', x: 0, y: 0, width: 10, height: 10 }))).toBe(true);
    expect(
      canBindTo(
        createArrow({
          id: 'b',
          x: 0,
          y: 0,
          points: [
            [0, 0],
            [1, 1],
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('normalizedAnchorFor', () => {
  it('reports where a point sits as a fraction of the box', () => {
    expect(normalizedAnchorFor(box('a', 100, 100, 200, 50), { x: 150, y: 125 })).toEqual({
      x: 0.25,
      y: 0.5,
    });
  });

  it('falls back to the middle for a shape with no extent', () => {
    expect(normalizedAnchorFor(box('a', 0, 0, 0, 0), { x: 0, y: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('resolveArrowTerminals', () => {
  it('leaves an unattached arrow exactly where it was drawn', () => {
    const arrow = arrowBetween([0, 0], [50, 50]);
    expect(resolveArrowTerminals(arrow, new Map())).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 50, y: 50 },
    });
  });

  it('stops short of the shape it points at', () => {
    // Target spans x 200–300 at y 0–100, so a horizontal arrow along y=50
    // crosses its left edge at x=200 and backs off by the gap.
    const target = box('target', 200, 0);
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'target' });

    const { start, end } = resolveArrowTerminals(arrow, mapOf(target));
    expect(start).toEqual({ x: 0, y: 50 });
    expect(end.x).toBeCloseTo(200 - BOUND_ARROW_GAP);
    expect(end.y).toBeCloseTo(50);
  });

  it('re-aims at whichever edge now faces the other end', () => {
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'target' });

    // Approached from the left, it lands on the left edge.
    const fromLeft = resolveArrowTerminals(arrow, mapOf(box('target', 200, 0)));
    expect(fromLeft.end.x).toBeCloseTo(200 - BOUND_ARROW_GAP);

    // Move the target to the other side and the same arrow lands on its right
    // edge instead — without the arrow itself having been touched.
    const fromRight = resolveArrowTerminals(arrow, mapOf(box('target', -200, 0)));
    expect(fromRight.end.x).toBeCloseTo(-100 + BOUND_ARROW_GAP);
  });

  it('follows the shape when it moves, with no change to the arrow', () => {
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'target' });
    const moved = resolveArrowTerminals(arrow, mapOf(box('target', 200, 300)));
    // The target went down; the end went with it rather than staying at y=50.
    expect(moved.end.y).toBeGreaterThan(200);
  });

  it('keeps the attachment through a resize, since the anchor is a fraction', () => {
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'target', precise: true });
    const small = resolveArrowTerminals(arrow, mapOf(box('target', 200, 0, 100, 100)));
    const large = resolveArrowTerminals(arrow, mapOf(box('target', 200, 0, 400, 400)));
    // The anchor is the centre either way, so a wider box is met further along.
    expect(large.end.x).toBeGreaterThan(small.end.x);
  });

  it('binds both ends, each stopping at its own shape', () => {
    const arrow = arrowBetween([50, 50], [250, 50], { start: 'a', end: 'b' });
    const { start, end } = resolveArrowTerminals(arrow, mapOf(box('a', 0, 0), box('b', 200, 0)));
    expect(start.x).toBeCloseTo(100 + BOUND_ARROW_GAP);
    expect(end.x).toBeCloseTo(200 - BOUND_ARROW_GAP);
  });

  it('keeps a length when the two shapes are almost touching', () => {
    const arrow = arrowBetween([50, 50], [115, 50], { start: 'a', end: 'b' });
    const { start, end } = resolveArrowTerminals(arrow, mapOf(box('a', 0, 0), box('b', 105, 0)));
    expect(end.x).toBeGreaterThan(start.x);
  });

  it('leaves an arrow bound to one shape at both ends alone', () => {
    const arrow = arrowBetween([10, 10], [60, 60], { start: 'a', end: 'a' });
    expect(resolveArrowTerminals(arrow, mapOf(box('a', 0, 0)))).toEqual({
      start: { x: 10, y: 10 },
      end: { x: 60, y: 60 },
    });
  });

  it('falls back to the points when the shape is gone', () => {
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'missing' });
    expect(resolveArrowTerminals(arrow, new Map())).toEqual({
      start: { x: 0, y: 50 },
      end: { x: 250, y: 50 },
    });
  });
});

describe('arrowsAffectedBy', () => {
  const arrow = arrowBetween([0, 50], [250, 50], { end: 'target' });

  it('picks up an arrow attached to something that moved', () => {
    expect(arrowsAffectedBy([arrow], new Set(['target']))).toHaveLength(1);
  });

  it('picks up a bound arrow that moved itself', () => {
    expect(arrowsAffectedBy([arrow], new Set(['arrow']))).toHaveLength(1);
  });

  it('ignores an arrow with nothing to do with it', () => {
    expect(arrowsAffectedBy([arrow], new Set(['elsewhere']))).toEqual([]);
    expect(arrowsAffectedBy([arrowBetween([0, 0], [1, 1])], new Set(['target']))).toEqual([]);
  });
});

describe('boundArrowPatches', () => {
  it('rewrites the geometry to match where the ends belong', () => {
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'target' });
    const [patch] = boundArrowPatches([arrow], mapOf(box('target', 200, 300)));
    expect(patch).toBeDefined();
    expect(patch!.id).toBe('arrow');
    expect(patch!.points[0]).toEqual([0, 0]);
  });

  it('writes nothing for an arrow already in the right place', () => {
    const target = box('target', 200, 0);
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'target' });
    const settled = boundArrowPatches([arrow], mapOf(target));

    const moved = createArrow({
      ...arrow,
      x: settled[0]!.x,
      y: settled[0]!.y,
      points: settled[0]!.points,
    });
    expect(boundArrowPatches([moved], mapOf(target))).toEqual([]);
  });
});

describe('withBindingsCleared', () => {
  it('lets go of the deleted shape and keeps the other end', () => {
    const arrow = arrowBetween([50, 50], [250, 50], { start: 'a', end: 'b' });
    const cleared = withBindingsCleared(arrow, new Set(['b']));
    expect(cleared?.startBinding?.shapeId).toBe('a');
    expect(cleared?.endBinding).toBeNull();
  });

  it('leaves the points where they were, so the arrow stays put', () => {
    const arrow = arrowBetween([50, 50], [250, 50], { end: 'b' });
    expect(withBindingsCleared(arrow, new Set(['b']))?.points).toEqual(arrow.points);
  });

  it('reports nothing to do when no attachment is involved', () => {
    const arrow = arrowBetween([50, 50], [250, 50], { end: 'b' });
    expect(withBindingsCleared(arrow, new Set(['z']))).toBeNull();
  });
});

describe('bindingTargetAt', () => {
  const shapes = [box('under', 0, 0), box('over', 50, 50)];

  it('takes the topmost shape under the point', () => {
    expect(bindingTargetAt(shapes, { x: 75, y: 75 }, 0)?.id).toBe('over');
  });

  it('reaches a little past the edge, since people aim at shapes not outlines', () => {
    expect(bindingTargetAt([box('a', 0, 0)], { x: 104, y: 50 }, 0)).toBeNull();
    expect(bindingTargetAt([box('a', 0, 0)], { x: 104, y: 50 }, 8)?.id).toBe('a');
  });

  it('never binds an arrow to itself', () => {
    expect(bindingTargetAt(shapes, { x: 75, y: 75 }, 0, 'over')?.id).toBe('under');
  });
});

describe('bindingFor', () => {
  it('records where on the shape the end was dropped', () => {
    expect(bindingFor(box('a', 0, 0, 200, 100), { x: 50, y: 50 })).toEqual({
      shapeId: 'a',
      anchor: { x: 0.25, y: 0.5 },
      precise: false,
    });
  });
});
