import type { Rect } from '../math.js';
import { arrowBounds } from './arrow.js';
import { diamondBounds } from './diamond.js';
import { ellipseBounds } from './ellipse.js';
import { frameBounds } from './frame.js';
import { freehandBounds } from './freehand.js';
import { imageBounds } from './image.js';
import { lineBounds } from './line.js';
import { rectangleBounds } from './rectangle.js';
import { assertNever, type Shape } from './shape.js';
import { textBoundsEstimate } from './text.js';

export function shapeBounds(shape: Shape) {
  switch (shape.kind) {
    case 'rectangle':
      return rectangleBounds(shape);
    case 'ellipse':
      return ellipseBounds(shape);
    case 'diamond':
      return diamondBounds(shape);
    case 'line':
      return lineBounds(shape);
    case 'arrow':
      return arrowBounds(shape);
    case 'freehand':
      return freehandBounds(shape);
    case 'text':
      return textBoundsEstimate(shape);
    case 'image':
      return imageBounds(shape);
    case 'frame':
      return frameBounds(shape);

    default:
      return assertNever(shape);
  }
}

export function boundsContainPoints(shape: Shape, px: number, py: number): boolean {
  const b = shapeBounds(shape);
  return px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/**
 * Whether `outer` encloses the whole of `inner`.
 *
 * Inclusive at the edges: a shape dragged a box around flush to its bounds
 * reads to the person drawing it as enclosed, and a rule that made them miss
 * by a sub-pixel would only ever feel broken.
 */
export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
