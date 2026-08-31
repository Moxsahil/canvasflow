/**
 * Who is standing in which frame.
 *
 * Membership is derived from geometry, not declared. A shape belongs to a
 * frame because it is sitting in it, and it stops belonging when it is dragged
 * out — there is no "add to frame" gesture to learn and none to forget. The
 * `frameId` on a shape is a cache of that answer, written when something
 * finishes moving, so the renderer and the drag handler don't each have to
 * re-derive it from every frame on the board on every frame of animation.
 *
 * The rule is the shape's **centre**, not its overlap: a shape counts as being
 * in the frame it is mostly in. Overlap would make a shape a member the
 * instant a corner crossed the boundary, so nudging something past a frame on
 * its way somewhere else would quietly adopt it. The centre is also what a
 * person would point at if you asked them which frame a half-in rectangle was
 * in.
 */

import { shapeBounds } from '../shapes/bounds.js';
import { isFrame, type FrameShape, type Shape } from '../shapes/shape.js';

/** Every frame on the board, in z-order. */
export function framesIn(shapes: readonly Shape[]): FrameShape[] {
  return shapes.filter(isFrame);
}

function centerOf(shape: Shape): { x: number; y: number } {
  const b = shapeBounds(shape);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function frameHolds(frame: FrameShape, x: number, y: number): boolean {
  return x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height;
}

/**
 * The frame a shape belongs in, or null for the open board.
 *
 * Topmost wins where frames overlap, matching what the eye reports: the frame
 * drawn last is the one that looks like it is holding the shape.
 *
 * A frame is never a member of another frame. Nesting is a real feature with
 * real questions attached — what a drag out of an inner frame means, how deep
 * clipping composes — and answering them by accident here would be worse than
 * leaving it out.
 */
export function frameForShape(shape: Shape, frames: readonly FrameShape[]): string | null {
  if (isFrame(shape)) return null;

  const { x, y } = centerOf(shape);
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i]!;
    if (frameHolds(frame, x, y)) return frame.id;
  }
  return null;
}

function frameSwallows(frame: FrameShape, shape: Shape): boolean {
  const b = shapeBounds(shape);
  return (
    b.x >= frame.x &&
    b.y >= frame.y &&
    b.x + b.width <= frame.x + frame.width &&
    b.y + b.height <= frame.y + frame.height
  );
}

function frameTouches(frame: FrameShape, shape: Shape): boolean {
  const b = shapeBounds(shape);
  return (
    b.x < frame.x + frame.width &&
    b.x + b.width > frame.x &&
    b.y < frame.y + frame.height &&
    b.y + b.height > frame.y
  );
}

/**
 * Membership after a frame has been resized, limited to what changed.
 *
 * Dragging a frame does not change who is in it — the frame took its contents
 * with it and nothing else moved. Resizing is the opposite: the frame's edges
 * sweep across the board while everything stands still, so the answer to
 * "what is in here" genuinely changes, and a frame pulled in past its own
 * contents that kept them would go on cropping them to nothing while still
 * moving and deleting them as its own.
 *
 * The two thresholds are deliberately different. A shape joins only once it is
 * **wholly** inside, and is let go only once it has stopped touching at all;
 * in between, whatever the frame already had it keeps. A single boundary would
 * flip shapes in and out of the frame as the handle crossed their edge, which
 * on a shared board is a write per flip. This gap is what makes the edge
 * sticky instead.
 */
export function membershipAfterResize(
  frame: FrameShape,
  shapes: readonly Shape[],
): MembershipChange[] {
  const changes: MembershipChange[] = [];

  for (const shape of shapes) {
    // A frame is never a member of a frame, and a shape another frame already
    // holds is not this one's to take — a resize is not a claim on someone
    // else's contents.
    if (isFrame(shape)) continue;

    const owned = shape.frameId === frame.id;
    if (!owned && shape.frameId != null) continue;

    if (!owned && frameSwallows(frame, shape)) {
      changes.push({ id: shape.id, frameId: frame.id });
    } else if (owned && !frameTouches(frame, shape)) {
      changes.push({ id: shape.id, frameId: null });
    }
  }

  return changes;
}

/** The shapes standing in one frame, in the order they were given. */
export function membersOf(frameId: string, shapes: readonly Shape[]): Shape[] {
  return shapes.filter((shape) => shape.frameId === frameId);
}

/**
 * A frame and everything standing in it.
 *
 * What "the frame" means for every operation that treats it as one object —
 * moving it, deleting it, duplicating it.
 */
export function frameWithMembers(frame: FrameShape, shapes: readonly Shape[]): Shape[] {
  return [frame, ...membersOf(frame.id, shapes)];
}

export interface MembershipChange {
  readonly id: string;
  readonly frameId: string | null;
}

/**
 * Membership for the given shapes, limited to the ones whose answer changed.
 *
 * Returning only changes rather than every shape's current frame keeps the
 * caller from writing a no-op to the document for everything it dragged, which
 * on a shared board is a message per shape per drop for nothing.
 */
export function membershipChanges(
  moved: readonly Shape[],
  shapes: readonly Shape[],
): MembershipChange[] {
  const frames = framesIn(shapes);
  if (frames.length === 0) {
    // Nothing to join, but something may still need releasing: the last frame
    // on the board can be deleted while shapes that were in it stay behind.
    return moved
      .filter((shape) => shape.frameId != null)
      .map((shape) => ({ id: shape.id, frameId: null }));
  }

  const changes: MembershipChange[] = [];
  for (const shape of moved) {
    const frameId = frameForShape(shape, frames);
    // `undefined` on a shape written before frames existed and `null` on one
    // explicitly released both mean the same thing, so compare loosely rather
    // than rewriting every old shape the first time it is touched.
    if (frameId !== (shape.frameId ?? null)) changes.push({ id: shape.id, frameId });
  }
  return changes;
}
