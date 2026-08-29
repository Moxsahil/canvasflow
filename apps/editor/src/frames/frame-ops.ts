/**
 * What it means to act on a frame rather than on a shape.
 *
 * A frame is one object to the person using it: dragging it takes its contents
 * along, deleting it deletes them, copying it copies them. None of that is in
 * the document model, which only knows that some shapes carry the frame's id —
 * so it lives here, as the small set of rules that turn a selection into the
 * set of shapes an operation should really touch.
 */

import {
  frameForShape,
  framesIn,
  isFrame,
  membersOf,
  shapeBounds,
  type FrameShape,
  type Shape,
} from '@canvasflow/canvas-engine';

/**
 * Gap left between a frame and its copy, in world units.
 *
 * The copy lands beside the original rather than offset over it. Frames are
 * large and mostly empty, so a copy dropped a few pixels down and right is
 * almost entirely on top of what it came from — you cannot see either one, and
 * repeating the copy builds a pile rather than a row.
 */
export const FRAME_DUPLICATE_GAP = 20;

/** The offset every other kind of shape is duplicated by. */
export const DEFAULT_DUPLICATE_OFFSET = { dx: 10, dy: 10 };

/** The given ids, plus everything standing in any frame among them. */
export function withFrameMembers(ids: readonly string[], shapes: readonly Shape[]): string[] {
  const selected = new Set(ids);
  const frameIds = shapes.filter((s) => selected.has(s.id) && isFrame(s)).map((s) => s.id);
  if (frameIds.length === 0) return [...selected];

  for (const frameId of frameIds) {
    for (const member of membersOf(frameId, shapes)) selected.add(member.id);
  }
  return [...selected];
}

/**
 * Where a duplicate of this selection should land.
 *
 * Clear of the original along one axis when a frame is involved, so repeating
 * the gesture lays copies out in a row instead of stacking them.
 */
export function duplicateOffsetFor(
  ids: readonly string[],
  shapes: readonly Shape[],
): { dx: number; dy: number } {
  const hasFrame = shapes.some((s) => ids.includes(s.id) && isFrame(s));
  if (!hasFrame) return DEFAULT_DUPLICATE_OFFSET;

  // Measured across everything that will be copied, members included: a frame
  // with something sticking out of it still has to clear what it came from,
  // and measuring the frame alone would drop the copy on top of the overhang.
  const copied = new Set(withFrameMembers(ids, shapes));

  let minX = Infinity;
  let maxX = -Infinity;
  for (const shape of shapes) {
    if (!copied.has(shape.id)) continue;
    const bounds = shapeBounds(shape);
    minX = Math.min(minX, bounds.x);
    maxX = Math.max(maxX, bounds.x + bounds.width);
  }

  return { dx: maxX - minX + FRAME_DUPLICATE_GAP, dy: 0 };
}

export interface FrameAssignment {
  readonly id: string;
  readonly frameId: string | null;
}

/**
 * Membership for shapes that have just been moved, limited to what changed.
 *
 * A frame among the moved shapes is skipped: it took its contents with it, so
 * nothing about who is standing in it changed. Shapes it was dragged *over*
 * are left alone too — membership follows the thing that moved, so moving a
 * container never quietly adopts whatever it passed across.
 */
export function assignmentsAfterMove(
  movedIds: readonly string[],
  shapes: readonly Shape[],
): FrameAssignment[] {
  const moved = new Set(movedIds);
  const frames = framesIn(shapes);
  const movedFrames = new Set(frames.filter((f) => moved.has(f.id)).map((f) => f.id));

  const assignments: FrameAssignment[] = [];
  for (const shape of shapes) {
    if (!moved.has(shape.id) || isFrame(shape)) continue;
    // Carried along inside a frame that was itself dragged.
    if (shape.frameId && movedFrames.has(shape.frameId)) continue;

    const frameId = frameForShape(shape, frames);
    if (frameId !== (shape.frameId ?? null)) assignments.push({ id: shape.id, frameId });
  }
  return assignments;
}

/**
 * The loose shapes a newly drawn frame should take in.
 *
 * Drawing a frame around things is the most direct way to say what belongs in
 * it, so it has to mean something. Shapes already in another frame are left
 * where they are: the new frame was drawn over that one, and stealing its
 * contents is not what anybody drawing a box means.
 */
export function shapesCapturedBy(frame: FrameShape, shapes: readonly Shape[]): string[] {
  return shapes
    .filter((shape) => !isFrame(shape) && shape.frameId == null)
    .filter((shape) => frameForShape(shape, [frame]) === frame.id)
    .map((shape) => shape.id);
}

/**
 * Members that sit below their own frame in z-order, and so are painted over
 * by it.
 *
 * Joining a frame does not move a shape in the stack, and it does not need to
 * — unless the frame is above it, in which case the frame's border and any
 * fill it has cover the very thing it just took in.
 */
export function membersHiddenByTheirFrame(shapes: readonly Shape[]): string[] {
  const depth = new Map(shapes.map((shape, index) => [shape.id, index]));

  return shapes
    .filter((shape) => {
      if (!shape.frameId) return false;
      const frameDepth = depth.get(shape.frameId);
      return frameDepth !== undefined && frameDepth > depth.get(shape.id)!;
    })
    .map((shape) => shape.id);
}
