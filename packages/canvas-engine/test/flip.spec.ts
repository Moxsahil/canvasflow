import { describe, expect, it } from 'vitest';
import { computeBoundingRect } from '../src/document/camera.js';
import { createFrame } from '../src/shapes/frame.js';
import { createImage } from '../src/shapes/image.js';
import { shapeBounds } from '../src/shapes/bounds.js';
import { flipShape, type FlipAxis } from '../src/shapes/flip.js';
import type { ArrowShape, ImageShape, Shape } from '../src/shapes/shape.js';
import {
  makeTestArrow,
  makeTestDiamond,
  makeTestEllipse,
  makeTestFreehand,
  makeTestLine,
  makeTestRectangle,
  makeTestText,
} from './fixtures/shapes.js';

const center = { x: 40, y: -15 };
const box = { x: -25, y: 30, width: 70, height: 20 };
const points = [
  [-10, 5],
  [0, 0],
  [30, -20],
] as const;
const path = { x: -25, y: 30, points };
const axes: FlipAxis[] = ['horizontal', 'vertical'];
const frame = () => createFrame({ id: 'frame', ...box, name: 'Ideas', seed: 9 });
const image = () =>
  createImage({
    id: 'image',
    ...box,
    fileId: 'source-file',
    mimeType: 'image/png',
    naturalWidth: 700,
    naturalHeight: 200,
    status: 'saved',
    seed: 10,
  });

const boxes = [makeTestRectangle(box), makeTestEllipse(box), makeTestDiamond(box), frame()];
const paths = [makeTestLine(path), makeTestArrow(path), makeTestFreehand(path)];

function worldPoints(shape: Shape) {
  if (!('points' in shape)) throw new Error('Expected a linear shape');
  return shape.points.map(([x, y]) => [shape.x + x, shape.y + y]);
}

describe('flipShape', () => {
  for (const shape of boxes) {
    it(`reflects the ${shape.kind} box without changing its dimensions or style`, () => {
      expect(flipShape(shape, 'horizontal', center)).toEqual({ ...shape, x: 35 });
      expect(flipShape(shape, 'vertical', center)).toEqual({ ...shape, y: -80 });
    });
  }

  for (const shape of paths) {
    it(`reflects every ${shape.kind} world point without reversing point order`, () => {
      const before = structuredClone(shape);
      const horizontal = flipShape(shape, 'horizontal', center);
      const vertical = flipShape(shape, 'vertical', center);
      expect(worldPoints(horizontal)).toEqual([
        [115, 35],
        [105, 30],
        [75, 10],
      ]);
      expect(worldPoints(vertical)).toEqual([
        [-35, -65],
        [-25, -60],
        [5, -40],
      ]);
      expect(horizontal).toMatchObject({ seed: shape.seed, rotation: shape.rotation });
      expect(shape).toEqual(before);
    });
  }

  it.each(['left', 'center', 'right'] as const)(
    'moves %s-aligned text by its measured box and keeps the glyphs readable',
    (textAlign) => {
      const shape = makeTestText({
        x: -25,
        y: 30,
        textAlign,
        text: 'First line\nSecond',
        scale: 2,
      });
      const bounds = shapeBounds(shape);
      const horizontal = flipShape(shape, 'horizontal', center);
      const vertical = flipShape(shape, 'vertical', center);
      expect(shapeBounds(horizontal).x).toBeCloseTo(2 * center.x - bounds.x - bounds.width, 10);
      expect(shapeBounds(vertical).y).toBeCloseTo(2 * center.y - bounds.y - bounds.height, 10);
      expect(horizontal).toMatchObject({
        text: shape.text,
        textAlign,
        fontSize: shape.fontSize,
        scale: 2,
      });
      expect(vertical).toMatchObject({
        text: shape.text,
        textAlign,
        fontSize: shape.fontSize,
        scale: 2,
      });
      expect(horizontal.y).toBe(shape.y);
      expect(vertical.x).toBe(shape.x);
      for (const axis of axes) {
        const restored = flipShape(flipShape(shape, axis, center), axis, center);
        expect(restored.x).toBeCloseTo(shape.x, 10);
        expect(restored.y).toBeCloseTo(shape.y, 10);
      }
    },
  );

  it('reflects image pixels independently on each axis and preserves the source', () => {
    const shape = image();
    const horizontal = flipShape(shape, 'horizontal', center) as ImageShape;
    const both = flipShape(horizontal, 'vertical', center) as ImageShape;
    expect(horizontal).toEqual({ ...shape, x: 35, flipX: true });
    expect(both).toEqual({ ...shape, x: 35, y: -80, flipX: true, flipY: true });
    const restored = flipShape(
      flipShape(both, 'horizontal', center),
      'vertical',
      center,
    ) as ImageShape;
    expect(restored).toEqual({ ...shape, flipX: false, flipY: false });
  });

  it('toggles an image even when its box is centered on the reflection axis', () => {
    const shape = image();
    const ownCenter = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
    expect(flipShape(shape, 'horizontal', ownCenter)).toEqual({ ...shape, flipX: true });
    expect(flipShape(shape, 'vertical', ownCenter)).toEqual({ ...shape, flipY: true });
  });

  it.each(axes)(
    'reflects arrow attachments and retains arrowhead ownership on a %s flip',
    (axis) => {
      const shape = makeTestArrow({
        ...path,
        label: 'read me',
        startArrowhead: 'circle',
        endArrowhead: 'triangle',
        startBinding: { shapeId: 'source', anchor: { x: 0.25, y: 0.125 }, precise: true },
        endBinding: { shapeId: 'target', anchor: { x: 0.5, y: 1 }, precise: false },
      });
      const flipped = flipShape(shape, axis, center) as ArrowShape;
      expect(flipped.startBinding).toEqual({
        ...shape.startBinding,
        anchor: axis === 'horizontal' ? { x: 0.75, y: 0.125 } : { x: 0.25, y: 0.875 },
      });
      expect(flipped.endBinding).toEqual({
        ...shape.endBinding,
        anchor: axis === 'horizontal' ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 },
      });
      expect(flipped.startArrowhead).toBe('circle');
      expect(flipped.endArrowhead).toBe('triangle');
      expect(flipped.label).toBe('read me');
      expect(flipShape(flipped, axis, center)).toEqual(shape);
    },
  );

  it('restores every shape after two flips on either axis without rounding integer coordinates', () => {
    for (const shape of [...boxes, ...paths, { ...image(), flipX: false, flipY: false }]) {
      for (const axis of axes) {
        expect(flipShape(flipShape(shape, axis, center), axis, center)).toEqual(shape);
      }
    }
  });

  it('handles zero-width paths and empty freehand without dividing by their size', () => {
    const line = makeTestLine({
      x: 0,
      y: 10,
      points: [
        [0, 0],
        [0, 50],
      ],
    });
    expect(flipShape(line, 'horizontal', center)).toEqual({ ...line, x: 80 });
    expect(worldPoints(flipShape(line, 'vertical', center))).toEqual([
      [0, -40],
      [0, -90],
    ]);
    const empty = makeTestFreehand({ x: 0, y: 10, points: [] });
    expect(flipShape(empty, 'horizontal', center)).toEqual({ ...empty, x: 80 });
    const zero = makeTestRectangle({ x: 0, y: 10, width: 0, height: 0 });
    expect(flipShape(zero, 'vertical', center)).toEqual({ ...zero, y: -40 });
  });

  it('returns the same object when the transform does not change geometry', () => {
    const shape = makeTestRectangle(box);
    const ownCenter = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
    for (const axis of axes) expect(flipShape(shape, axis, ownCenter)).toBe(shape);
    const line = makeTestLine({
      x: 40,
      points: [
        [0, 0],
        [0, 100],
      ],
    });
    expect(flipShape(line, 'horizontal', center)).toBe(line);
    const arrow = makeTestArrow({
      x: 40,
      points: [
        [0, 0],
        [0, 100],
      ],
      endBinding: { shapeId: 'target', anchor: { x: 0.5, y: 0.5 }, precise: true },
    });
    expect(flipShape(arrow, 'horizontal', center)).toBe(arrow);
  });

  it('does not turn fractional centered boxes into rounding-only updates', () => {
    for (const x of [0.1, 1.1, 42372.31113797717]) {
      for (const width of [0.2, 0.3, 5051.318356543799]) {
        const shape = makeTestRectangle({ x, y: x, width, height: width });
        const bounds = computeBoundingRect([shape])!;
        const ownCenter = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        for (const axis of axes) expect(flipShape(shape, axis, ownCenter)).toBe(shape);
      }
    }
  });

  it('rejects non-finite input or overflow without writing corrupted geometry', () => {
    const shape = makeTestRectangle(box);
    expect(flipShape(shape, 'horizontal', { x: Infinity, y: 0 })).toBe(shape);
    const malformed: Shape[] = [
      { ...shape, x: Number.NaN },
      { ...shape, width: Infinity },
      { ...shape, height: -1 },
      makeTestLine({
        points: [
          [0, 0],
          [Infinity, 20],
        ],
      }),
      makeTestArrow({
        startBinding: { shapeId: 'bad', anchor: { x: Number.NaN, y: 0 }, precise: true },
      }),
    ];
    for (const invalid of malformed) expect(flipShape(invalid, 'horizontal', center)).toBe(invalid);
    const farAway = makeTestLine({ x: -Number.MAX_VALUE });
    expect(flipShape(farAway, 'horizontal', { x: Number.MAX_VALUE, y: 0 })).toBe(farAway);
  });
});
