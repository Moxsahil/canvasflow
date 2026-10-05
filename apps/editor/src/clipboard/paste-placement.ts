import {
  computeBoundingRect,
  frameForShape,
  framesIn,
  isArrow,
  isFrame,
  lockedShapeIds,
  type ArrowBinding,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { Point } from '../machine/tool-machine.types';

/**
 * Copies of these shapes under new ids, still pointing at each other.
 *
 * A shape can name another — the frame it stands in, the shapes an arrow is
 * attached to. Where both ends of that were copied together the copy names the
 * copy, so a pasted frame holds its own pasted contents and a pasted arrow
 * joins the pasted boxes rather than reaching back to the ones they came from.
 * A reference to something left behind is kept as it was.
 */
export function withFreshIds(shapes: readonly Shape[], genId: () => string): Shape[] {
  // An id per shape rather than per old id: two entries claiming the same old
  // id must still come out as two shapes the document can tell apart.
  const copies = shapes.map((shape) => ({ shape, id: genId() }));
  const fresh = new Map(copies.map(({ shape, id }) => [shape.id, id]));

  const relinked = (binding: ArrowBinding | null): ArrowBinding | null => {
    const shapeId = binding ? fresh.get(binding.shapeId) : undefined;
    return binding && shapeId ? { ...binding, shapeId } : binding;
  };

  return copies.map(({ shape, id }) => {
    const frameId = shape.frameId != null ? fresh.get(shape.frameId) : undefined;
    // A copy is something to work on. One that arrived locked could not even
    // be moved off the original it was copied from.
    const { locked: _wasLocked, ...unlocked } = shape;
    const copy = (frameId ? { ...unlocked, id, frameId } : { ...unlocked, id }) as Shape;
    return isArrow(copy)
      ? {
          ...copy,
          startBinding: relinked(copy.startBinding),
          endBinding: relinked(copy.endBinding),
        }
      : copy;
  });
}

/**
 * The same shapes moved as one, so the middle of the box around them sits on
 * a point — where a paste aimed at a spot on the board puts them.
 *
 * They keep their places relative to each other, and so keep whatever they
 * hold among themselves: a frame pasted with its contents still holds them,
 * an arrow pasted with the shapes it joins still joins them. What they held
 * on to outside the group was left behind where they were copied from, so it
 * is settled again for where they land:
 *
 * - the frame a shape stands in is worked out from the geometry, against the
 *   frames already on the board and the ones arriving with it;
 * - an arrow end attached to a shape that did not come along is let go. The
 *   arrow's points were kept true all along, so it keeps the shape it had.
 */
export function shapesCentredOn(
  shapes: readonly Shape[],
  point: Point,
  board: readonly Shape[],
): Shape[] {
  const bounds = computeBoundingRect(shapes);
  if (!bounds) return [];

  const dx = point.x - (bounds.x + bounds.width / 2);
  const dy = point.y - (bounds.y + bounds.height / 2);
  const arriving = new Set(shapes.map((shape) => shape.id));
  const held = (binding: ArrowBinding | null) =>
    binding && arriving.has(binding.shapeId) ? binding : null;

  const placed = shapes.map((shape): Shape => {
    const moved: Shape = {
      ...shape,
      x: shape.x + dx,
      y: shape.y + dy,
      // Carried along inside a frame that came too, as a member is when its
      // frame is dragged. Anything else is decided below.
      frameId: shape.frameId != null && arriving.has(shape.frameId) ? shape.frameId : null,
    };
    return isArrow(moved)
      ? { ...moved, startBinding: held(moved.startBinding), endBinding: held(moved.endBinding) }
      : moved;
  });

  // Pasted shapes land on top, so their frames come after the board's: where
  // two overlap, the one drawn last is the one that holds what is in it.
  // Never into a locked frame, which would lock what was just pasted.
  const lockedOnBoard = lockedShapeIds(board);
  const onBoard = framesIn(board).filter((frame) => !lockedOnBoard.has(frame.id));
  let frames = [...onBoard, ...framesIn(placed)];

  for (let i = 0; i < placed.length; i++) {
    const shape = placed[i]!;
    if (shape.frameId != null) continue;

    const frameId = frameForShape(shape, frames);
    if (!frameId) continue;
    placed[i] = { ...shape, frameId };

    // One frame at a time, each seeing the homes already given: two frames
    // arriving on the same spot each hold the other, and only the second
    // knowing about the first stops them from both claiming it.
    if (isFrame(shape)) frames = [...onBoard, ...framesIn(placed)];
  }

  return placed;
}
