import type { Point, Rect } from '../math.js';
import type { Shape } from './shape.js';

/**
 * The kinds that turn. Each is a box drawn upright and then turned about its
 * middle, so everything that measures one — its outline, a press on it, an
 * arrow attached to it — can work in the upright box and turn the answer.
 *
 * The rest keep whatever `rotation` they carry unread: a line, an arrow or a
 * drawing is its points, and turning one means moving them; a frame, a note,
 * an embed, a bookmark or a topic stays square to the board.
 */
export function isRotatable(shape: Shape): boolean {
  switch (shape.kind) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'text':
    case 'image':
      return true;
    default:
      return false;
  }
}

/** How far a shape is turned, clockwise in radians; 0 for a kind that never turns. */
export function shapeAngle(shape: Shape): number {
  if (!isRotatable(shape)) return 0;
  const angle = shape.rotation;
  return Number.isFinite(angle) ? angle : 0;
}

/** An angle brought into [0, 2π), so it is stored the same however it was reached. */
export function normalizeAngle(angle: number): number {
  const turn = Math.PI * 2;
  const wrapped = angle % turn;
  const normal = wrapped < 0 ? wrapped + turn : wrapped;
  // A whole turn that lands a hair under 2π is upright.
  return turn - normal < 1e-9 ? 0 : normal;
}

/** The middle of a box, which is what a shape turns about. */
export function rectCentre(box: Rect): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** `point` turned by `angle` about `centre`. */
export function rotatePoint(point: Point, centre: Point, angle: number): Point {
  if (angle === 0) return point;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}

/** The four corners of `box` turned by `angle` about its middle, clockwise from its top-left. */
export function rotatedCorners(box: Rect, angle: number): Point[] {
  const centre = rectCentre(box);
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return [
    { x: box.x, y: box.y },
    { x: right, y: box.y },
    { x: right, y: bottom },
    { x: box.x, y: bottom },
  ].map((corner) => rotatePoint(corner, centre, angle));
}

/** The upright box that holds `box` turned by `angle` about its middle. */
export function rotatedRectBounds(box: Rect, angle: number): Rect {
  if (angle === 0) return box;
  const corners = rotatedCorners(box, angle);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
