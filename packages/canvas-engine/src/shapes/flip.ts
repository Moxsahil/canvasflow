import type { Point, Rect } from '../math.js';
import { shapeBounds } from './bounds.js';
import { assertNever, type ArrowBinding, type Shape } from './shape.js';

export type FlipAxis = 'horizontal' | 'vertical';

function reflect(value: number, center: number): number {
  return center + (center - value);
}

function reflectedBoxAnchor(origin: number, start: number, size: number, center: number): number {
  const offset = center - (start + size / 2);
  // The union bounds can round their width by one ULP. A centered box still
  // has not moved, and must not create a collaboration update or undo step.
  const precision = Number.EPSILON * Math.max(1, Math.abs(center), Math.abs(start), size);
  return Math.abs(offset) <= precision ? origin : origin + offset * 2;
}

function finiteBounds(bounds: Rect): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width >= 0 &&
    bounds.height >= 0
  );
}

function finiteBinding(binding: ArrowBinding | null): boolean {
  return (
    binding === null || (Number.isFinite(binding.anchor.x) && Number.isFinite(binding.anchor.y))
  );
}

function flipBinding(binding: ArrowBinding | null, axis: FlipAxis): ArrowBinding | null {
  if (!binding) return binding;
  const key = axis === 'horizontal' ? 'x' : 'y';
  const value = 1 - binding.anchor[key];
  if (value === binding.anchor[key]) return binding;
  return { ...binding, anchor: { ...binding.anchor, [key]: value } };
}

/**
 * Reflect one shape about a shared selection centre in canvas coordinates.
 *
 * Text and frame names remain readable; images reflect their pixels through
 * persistent flags. Linear shapes retain point order and arrowhead ownership.
 * The caller expands frame contents and only passes bound arrows when all of
 * their targets take part, so their normalized anchors can reflect with them.
 * Rotation is intentionally unchanged while the engine renders axis-aligned
 * shapes. An unchanged or invalid transform returns the original object.
 */
export function flipShape(shape: Shape, axis: FlipAxis, center: Point): Shape {
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(shape.x) ||
    !Number.isFinite(shape.y)
  ) {
    return shape;
  }

  const horizontal = axis === 'horizontal';
  switch (shape.kind) {
    case 'line':
    case 'arrow':
    case 'freehand': {
      if (
        !shape.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) ||
        (shape.kind === 'arrow' &&
          (!finiteBinding(shape.startBinding) || !finiteBinding(shape.endBinding)))
      ) {
        return shape;
      }

      const x = horizontal ? reflect(shape.x, center.x) : shape.x;
      const y = horizontal ? shape.y : reflect(shape.y, center.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return shape;

      const coordinate = horizontal ? 0 : 1;
      const pointsChanged = shape.points.some((point) => point[coordinate] !== 0);
      const points = pointsChanged
        ? shape.points.map((point): readonly [number, number] => {
            // Reuse points on the mirror axis, also avoiding needless -0 values.
            if (point[coordinate] === 0) return point;
            return horizontal ? [-point[0], point[1]] : [point[0], -point[1]];
          })
        : shape.points;

      if (shape.kind === 'arrow') {
        const startBinding = flipBinding(shape.startBinding, axis);
        const endBinding = flipBinding(shape.endBinding, axis);
        if (
          x === shape.x &&
          y === shape.y &&
          !pointsChanged &&
          startBinding === shape.startBinding &&
          endBinding === shape.endBinding
        ) {
          return shape;
        }
        return { ...shape, x, y, points, startBinding, endBinding };
      }

      if (x === shape.x && y === shape.y && !pointsChanged) return shape;
      return { ...shape, x, y, points };
    }

    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'text':
    case 'image':
    case 'frame': {
      const bounds = shapeBounds(shape);
      if (!finiteBounds(bounds)) return shape;

      // Text x is an alignment anchor, so translate it by the bounds' movement
      // instead of treating it as the left edge or reversing its glyphs.
      const x = horizontal
        ? reflectedBoxAnchor(shape.x, bounds.x, bounds.width, center.x)
        : shape.x;
      const y = horizontal
        ? shape.y
        : reflectedBoxAnchor(shape.y, bounds.y, bounds.height, center.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return shape;

      if (shape.kind === 'image') {
        return horizontal
          ? { ...shape, x, y, flipX: !shape.flipX }
          : { ...shape, x, y, flipY: !shape.flipY };
      }
      if (x === shape.x && y === shape.y) return shape;
      return { ...shape, x, y };
    }

    default:
      return assertNever(shape);
  }
}
