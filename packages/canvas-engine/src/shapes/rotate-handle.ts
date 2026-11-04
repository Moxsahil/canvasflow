import type { Point } from '../math.js';
import { shapeBox } from './bounds.js';
import { isRotatable, rectCentre, rotatePoint, shapeAngle } from './rotation.js';
import type { Shape } from './shape.js';

/** How far the selection box stands off a shape, in screen pixels. */
export const SELECTION_PAD = 4;

/** How far above the selection box the turning handle stands, in screen pixels. */
export const ROTATE_HANDLE_GAP = 20;

/**
 * Where the handle that turns a shape stands: a dot above the middle of its
 * top edge, which turns with it, so it is always on the side that was the top.
 * Null for a kind that does not turn.
 */
export function rotateHandlePosition(shape: Shape, zoom: number): Point | null {
  if (!isRotatable(shape)) return null;
  const box = shapeBox(shape);
  const centre = rectCentre(box);
  const upright = { x: centre.x, y: box.y - (SELECTION_PAD + ROTATE_HANDLE_GAP) / zoom };
  return rotatePoint(upright, centre, shapeAngle(shape));
}
