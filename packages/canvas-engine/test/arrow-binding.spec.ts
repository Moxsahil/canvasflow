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
  withPinnedBindings,
  bindingPointOf,
  bindingAt,
} from '../src/shapes/arrow-binding.js';
import type { ArrowShape } from '../src/shapes/shape.js';
import { createText } from '../src/shapes/text.js';

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

  it('stops where its head meets the edge of the shape, with no gap', () => {
    // Target spans x 200–300 at y 0–100, so a horizontal arrow along y=50
    // crosses its left edge at x=200. Half the box's 2-unit stroke lies
    // outside that, and the head's round tip reaches half the arrow's 2-unit
    // stroke past its point: the end stops 1 + 1 short, edge to edge.
    const target = box('target', 200, 0);
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'target' });

    const { start, end } = resolveArrowTerminals(arrow, mapOf(target));
    expect(start).toEqual({ x: 0, y: 50 });
    expect(end.x).toBeCloseTo(198);
    expect(end.y).toBeCloseTo(50);
  });

  it('keeps the edges touching however thick either stroke is', () => {
    const target = createRectangle({
      id: 'target',
      x: 200,
      y: 0,
      width: 100,
      height: 100,
      strokeWidth: 8,
    });
    const arrow = { ...arrowBetween([0, 50], [250, 50], { end: 'target' }), strokeWidth: 4 };

    const { end } = resolveArrowTerminals(arrow, mapOf(target));
    // 4 of the box's stroke outside its outline, 2 of the head past its tip.
    expect(end.x).toBeCloseTo(194);
  });

  it('reaches a circle head by its radius, so the circle sits against the shape', () => {
    const arrow = {
      ...arrowBetween([0, 50], [250, 50], { end: 'target' }),
      endArrowhead: 'circle' as const,
    };

    const { end } = resolveArrowTerminals(arrow, mapOf(box('target', 200, 0)));
    // Radius (15 + 2 - 2) / 2 = 7.5, plus the box's 1 outside its outline.
    expect(end.x).toBeCloseTo(200 - 8.5);
  });

  it('meets text, which has no stroke, at its box', () => {
    const label = createText({ id: 'target', x: 200, y: 0, text: 'Hi' });
    const arrow = arrowBetween([0, 0], [250, 0], { end: 'target' });

    const { end } = resolveArrowTerminals(arrow, mapOf(label));
    // Nothing of the text's outside its box; only the head's 1 past its tip.
    expect(end.x).toBeCloseTo(199);
  });

  it('re-aims at whichever edge now faces the other end', () => {
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'target' });

    // Approached from the left, it lands on the left edge.
    const fromLeft = resolveArrowTerminals(arrow, mapOf(box('target', 200, 0)));
    expect(fromLeft.end.x).toBeCloseTo(198);

    // Move the target to the other side and the same arrow lands on its right
    // edge instead — without the arrow itself having been touched.
    const fromRight = resolveArrowTerminals(arrow, mapOf(box('target', -200, 0)));
    expect(fromRight.end.x).toBeCloseTo(-98);
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
    // The start has no head: its flat end stops at the stroke's outer edge.
    expect(start.x).toBeCloseTo(101);
    expect(end.x).toBeCloseTo(198);
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

/** A binding fixed at a spot on the shape, as a fraction of its box. */
const fixedAt = (shapeId: string, x: number, y: number) => ({
  shapeId,
  anchor: { x, y },
  precise: true,
});

describe('fixed bindings', () => {
  it('keep the end on its spot even when the shape slides past the other end', () => {
    // Started on the box's right edge, free end out at x=300.
    const arrow: ArrowShape = {
      ...arrowBetween([100, 50], [300, 50]),
      startBinding: fixedAt('box', 1, 0.5),
    };
    // The box moved right over the free end: the start stays on the right
    // edge, now at x=350, rather than jumping inside or round to the left.
    const { start, end } = resolveArrowTerminals(arrow, mapOf(box('box', 250, 0)));
    expect(end).toEqual({ x: 300, y: 50 });
    // Half the box's stroke short of its edge, back towards the other end.
    expect(start.x).toBeCloseTo(349);
    expect(start.y).toBeCloseTo(50);
  });

  it('follow the shape anywhere, pivoting rather than re-aiming', () => {
    const arrow: ArrowShape = {
      ...arrowBetween([0, 50], [200, 50]),
      endBinding: fixedAt('box', 0, 0.5),
    };
    // Moved below and to the left of the free end: the end stays on the left
    // edge's middle, at (-50, 350), not on the top edge that now faces the
    // other end — backed off 2 from it towards the other end, so the head's
    // tip meets the edge.
    const { end } = resolveArrowTerminals(arrow, mapOf(box('box', -50, 300)));
    expect(Math.hypot(end.x + 50, end.y - 350)).toBeCloseTo(2);
    expect(end.y).toBeGreaterThan(340);
  });
});

describe('withPinnedBindings', () => {
  it('fixes an end that aims at the middle to where it meets the shape now', () => {
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'box' });
    const pinned = withPinnedBindings(arrow, mapOf(box('box', 200, 0)));

    // It met the left edge, half way down.
    expect(pinned.endBinding).toEqual({ shapeId: 'box', anchor: { x: 0, y: 0.5 }, precise: true });
    // So nothing moves on screen.
    expect(resolveArrowTerminals(pinned, mapOf(box('box', 200, 0)))).toEqual(
      resolveArrowTerminals(arrow, mapOf(box('box', 200, 0))),
    );
  });

  it('fixes both ends to the edges that face each other', () => {
    const arrow = arrowBetween([50, 50], [250, 50], { start: 'a', end: 'b' });
    const pinned = withPinnedBindings(arrow, mapOf(box('a', 0, 0), box('b', 200, 0)));
    expect(pinned.startBinding!.anchor).toEqual({ x: 1, y: 0.5 });
    expect(pinned.endBinding!.anchor).toEqual({ x: 0, y: 0.5 });
  });

  it('then keeps the end on that spot as the shape moves', () => {
    const arrow = arrowBetween([0, 50], [250, 50], { end: 'box' });
    const pinned = withPinnedBindings(arrow, mapOf(box('box', 200, 0)));

    // Down by 100: still the left edge's middle, at y=150 now.
    const { end } = resolveArrowTerminals(pinned, mapOf(box('box', 200, 100)));
    expect(end.x).toBeCloseTo(198, 0);
    expect(end.y).toBeCloseTo(149, 0);
  });

  it('fixes an end whose line never crosses its shape where it stands', () => {
    // The free end is inside the box, so the line to the middle never crosses.
    const arrow = arrowBetween([230, 50], [260, 50], { end: 'box' });
    const pinned = withPinnedBindings(arrow, mapOf(box('box', 200, 0)));
    expect(pinned.endBinding).toEqual({
      shapeId: 'box',
      anchor: { x: 0.6, y: 0.5 },
      precise: true,
    });
  });

  it('hands back the very arrow when there is nothing to fix', () => {
    const loose = arrowBetween([0, 0], [100, 0]);
    expect(withPinnedBindings(loose, mapOf())).toBe(loose);

    const fixed: ArrowShape = { ...loose, endBinding: fixedAt('box', 0, 0.5) };
    expect(withPinnedBindings(fixed, mapOf(box('box', 200, 0)))).toBe(fixed);
  });
});

describe('bindingPointOf', () => {
  it('finds the spot a fixed binding holds its end to, wherever the shape is', () => {
    const binding = fixedAt('box', 0, 0.5);
    expect(bindingPointOf(binding, mapOf(box('box', 200, 0)))).toEqual({ x: 200, y: 50 });
    expect(bindingPointOf(binding, mapOf(box('box', 500, 300)))).toEqual({ x: 500, y: 350 });
  });

  it('has no spot for a binding that aims at the middle, nor for a shape that is gone', () => {
    const aiming = { shapeId: 'box', anchor: { x: 0.5, y: 0.5 }, precise: false };
    expect(bindingPointOf(aiming, mapOf(box('box', 200, 0)))).toBeNull();
    expect(bindingPointOf(fixedAt('gone', 0, 0.5), mapOf(box('box', 200, 0)))).toBeNull();
    expect(bindingPointOf(null, mapOf())).toBeNull();
  });
});

describe('bindingAt', () => {
  // A 100×100 box at the origin, with an arrow coming from far to the left.
  const target = box('box', 0, 0);
  const from = { x: -300, y: 50 };
  const spotOf = (shape: Shape, point: { x: number; y: number }, reach = 8) =>
    bindingPointOf(bindingAt(shape, point, from, reach), mapOf(shape))!;

  it('attaches at a corner when let go by the corner', () => {
    expect(bindingAt(target, { x: 103, y: -2 }, from, 8)).toEqual({
      shapeId: 'box',
      anchor: { x: 1, y: 0 },
      precise: true,
    });
  });

  it('attaches anywhere along a side: the middle, or any point between', () => {
    expect(bindingAt(target, { x: 50, y: -3 }, from, 8).anchor).toEqual({ x: 0.5, y: 0 });
    expect(bindingAt(target, { x: 27, y: 104 }, from, 8).anchor).toEqual({ x: 0.27, y: 1 });
    // Just inside the right side, the far side from the other end, still takes it.
    expect(bindingAt(target, { x: 96, y: 70 }, from, 8).anchor).toEqual({ x: 1, y: 0.7 });
  });

  it('takes a point let go deep inside as aimed at: where the line from the other end comes in', () => {
    // Let go in the middle at y=30, from the left: the left side, at that height.
    const binding = bindingAt(target, { x: 50, y: 30 }, { x: -300, y: 30 }, 8);
    expect(binding.anchor.x).toBeCloseTo(0);
    expect(binding.anchor.y).toBeCloseTo(0.3);
  });

  it('lands on an ellipse itself, not on its box', () => {
    const ellipse = createEllipse({ id: 'e', x: 0, y: 0, width: 200, height: 100 });
    const spot = spotOf(ellipse, { x: 175, y: 10 });
    // On the curve: ((x-100)/100)² + ((y-50)/50)² is 1, to within a hair.
    expect(((spot.x - 100) / 100) ** 2 + ((spot.y - 50) / 50) ** 2).toBeCloseTo(1, 2);
  });

  it('lands on a rounded corner where it is drawn, not on the corner of its box', () => {
    const rounded = createRectangle({
      id: 'r',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      edges: 'round',
    });
    // The corner is cut back 25 along each side and bridged by a quadratic
    // through the box's corner, whose middle is at (100 - 25/4, 25/4).
    const spot = spotOf(rounded, { x: 104, y: -4 });
    expect(spot.x).toBeCloseTo(93.75, 0);
    expect(spot.y).toBeCloseTo(6.25, 0);
  });

  it('follows the shape from that spot, wherever it goes', () => {
    const arrow: ArrowShape = {
      ...arrowBetween([-300, 0], [103, -2]),
      endBinding: bindingAt(target, { x: 103, y: -2 }, { x: -300, y: 0 }, 8),
    };
    // The box moves down: the end stays on its top right corner.
    const { end } = resolveArrowTerminals(arrow, mapOf(box('box', 0, 200)));
    expect(Math.hypot(end.x - 100, end.y - 200)).toBeCloseTo(2);
  });
});
