import type { Point, Rect } from '../math.js';
import { arrowBounds } from './arrow.js';
import { diamondBounds } from './diamond.js';
import { ellipseBounds } from './ellipse.js';
import { frameBounds } from './frame.js';
import { freehandBounds } from './freehand.js';
import { bookmarkBounds } from './bookmark.js';
import { embedBounds } from './embed.js';
import { imageBounds } from './image.js';
import { lineBounds } from './line.js';
import { rectangleBounds } from './rectangle.js';
import { assertNever, type Shape } from './shape.js';
import { textBoundsEstimate } from './text.js';
import { topicBounds } from './topic.js';
import { noteBounds } from './note.js';
import { rectCentre, rotatePoint, rotatedRectBounds, shapeAngle } from './rotation.js';

/**
 * The box a shape is drawn in before it is turned: the one its width and
 * height describe, and the one its handles and its words are laid out in.
 * The same as `shapeBounds` for a shape that is not turned.
 */
export function shapeBox(shape: Shape): Rect {
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
    case 'embed':
      return embedBounds(shape);
    case 'bookmark':
      return bookmarkBounds(shape);
    case 'frame':
      return frameBounds(shape);
    case 'topic':
      return topicBounds(shape);
    case 'note':
      return noteBounds(shape);

    default:
      return assertNever(shape);
  }
}

/**
 * A board point in a turned shape's own upright frame: turned back about its
 * middle, so it can be measured against `shapeBox`.
 */
export function toShapeFrame(shape: Shape, point: Point): Point {
  const angle = shapeAngle(shape);
  if (angle === 0) return point;
  return rotatePoint(point, rectCentre(shapeBox(shape)), -angle);
}

/** A point in a shape's upright frame put where it is on the board — `toShapeFrame` undone. */
export function fromShapeFrame(shape: Shape, point: Point): Point {
  const angle = shapeAngle(shape);
  if (angle === 0) return point;
  return rotatePoint(point, rectCentre(shapeBox(shape)), angle);
}

/**
 * The upright box a shape covers on the board. For a turned shape that is the
 * box around its turned corners, which is what anything asking "what is near
 * here", "what fits in this" or "how much room does it take" wants.
 */
export function shapeBounds(shape: Shape): Rect {
  return rotatedRectBounds(shapeBox(shape), shapeAngle(shape));
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
