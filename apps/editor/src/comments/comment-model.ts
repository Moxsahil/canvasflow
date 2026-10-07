/**
 * What a comment on the board is, apart from how it is stored or drawn.
 *
 * A thread is a conversation pinned somewhere on the board: it owns where the
 * pin is and whether the matter is settled, and holds its comments oldest
 * first. Threads are flat — a reply answers the thread, not another reply.
 */

import {
  hitTest,
  isFrame,
  shapeBounds,
  type Shape,
  type SpatialIndex,
} from '@canvasflow/canvas-engine';
import type { Point } from '../machine/tool-machine.types';

export interface CommentAuthor {
  readonly id: string;
  readonly name: string;
  /**
   * The username they had when this was written, so the @ list can offer them
   * by it once they have left the board. Absent for anyone without one, and
   * on anything written before usernames were kept.
   */
  readonly username?: string;
}

/**
 * Where a thread's pin stands.
 *
 * On a shape, as a fraction of the box around it, so the pin keeps its spot
 * as the shape is moved and resized — the same idea as the end of an arrow
 * bound to a shape. `point` is always kept beside it: the place on the board
 * the pin stands when it has no shape to stand on, because it was dropped on
 * empty board or because the shape has since gone.
 *
 * The attachment is never cleared when its shape is deleted. A pin whose shape
 * comes back — the delete undone — is found standing on it again, with nothing
 * having had to remember that it used to be.
 */
export interface CommentAnchor {
  readonly shapeId: string | null;
  /** 0–1 within the shape's bounds. Read only while `shapeId` names a shape. */
  readonly at: Point;
  readonly point: Point;
}

export interface Comment {
  readonly id: string;
  readonly authorId: string;
  /**
   * The author's name as it was when they wrote. Kept on the comment so it can
   * be shown for someone who is no longer on the board to ask.
   */
  readonly authorName: string;
  /** Their username as it was when they wrote, or null. */
  readonly authorUsername: string | null;
  readonly createdAt: number;
  /** Null until the comment is first edited. */
  readonly editedAt: number | null;
  readonly body: string;
  /** The people named in the body with an @, each once. */
  readonly mentions: readonly CommentAuthor[];
  /** In the order each emoji was first given. */
  readonly reactions: readonly CommentReaction[];
}

/** One emoji left on a comment, and everyone who left it, first to last. */
export interface CommentReaction {
  readonly emoji: string;
  readonly by: readonly CommentAuthor[];
}

export interface CommentResolution {
  readonly at: number;
  readonly by: string;
  readonly byName: string;
}

export interface CommentThread {
  readonly id: string;
  readonly anchor: CommentAnchor;
  readonly createdBy: string;
  readonly createdAt: number;
  /** When and by whom the thread was settled, or null while it is open. */
  readonly resolved: CommentResolution | null;
  /** Oldest first. Never empty: a thread goes with its last comment. */
  readonly comments: readonly Comment[];
}

/** A comment is only worth posting if it says something. */
export function isCommentEmpty(body: string): boolean {
  return body.trim().length === 0;
}

/** Bodies are stored as typed, less the space around them. */
export function cleanCommentBody(body: string): string {
  return body.replace(/\r\n?/g, '\n').trim();
}

/**
 * The shape a comment dropped here would attach to, or null for empty board.
 *
 * Whatever a click here would select, topmost first. Failing that, a frame
 * the point is inside: a frame answers a click only on its border, since it
 * is hollow to the select tool, but a comment dropped in the middle of one is
 * plainly about it.
 */
export function commentTargetAt(
  point: Point,
  shapes: readonly Shape[],
  index: SpatialIndex,
  zoom: number,
): Shape | null {
  const hit = hitTest(shapes, index, point.x, point.y, zoom);
  if (hit) return hit;

  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i]!;
    if (!isFrame(shape)) continue;
    const inside =
      point.x >= shape.x &&
      point.x <= shape.x + shape.width &&
      point.y >= shape.y &&
      point.y <= shape.y + shape.height;
    if (inside) return shape;
  }
  return null;
}

/** The anchor for a pin dropped at `point`, on `target` if there is one. */
export function anchorAt(point: Point, target: Shape | null): CommentAnchor {
  const here = { x: point.x, y: point.y };
  if (!target) return { shapeId: null, at: { x: 0.5, y: 0.5 }, point: here };

  const bounds = shapeBounds(target);
  // A shape with no extent on an axis — a level line — has no fraction to
  // measure along it, so the pin takes the middle.
  return {
    shapeId: target.id,
    at: {
      x: bounds.width > 0 ? (point.x - bounds.x) / bounds.width : 0.5,
      y: bounds.height > 0 ? (point.y - bounds.y) / bounds.height : 0.5,
    },
    point: here,
  };
}

/**
 * Where a pin stands on the board: on its shape while the shape is there, and
 * at its own point otherwise.
 */
export function anchorPoint(anchor: CommentAnchor, shapesById: ReadonlyMap<string, Shape>): Point {
  const shape = anchor.shapeId ? shapesById.get(anchor.shapeId) : undefined;
  if (!shape) return anchor.point;

  const bounds = shapeBounds(shape);
  return {
    x: bounds.x + anchor.at.x * bounds.width,
    y: bounds.y + anchor.at.y * bounds.height,
  };
}

/**
 * Who may change what.
 *
 * Anyone who can comment can settle a thread, reopen it, reply to it and move
 * its pin: none of those is anyone's in particular. A comment is its author's
 * to edit and delete, and a thread is its starter's to delete.
 */
export function canEditComment(comment: Comment, userId: string | null): boolean {
  return userId !== null && comment.authorId === userId;
}

export function canDeleteThread(thread: CommentThread, userId: string | null): boolean {
  return userId !== null && thread.createdBy === userId;
}
