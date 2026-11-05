import {
  hasPointHandles,
  rotateHandlePosition,
  SELECTION_PAD,
  shapeAngle,
  shapeBox,
  toShapeFrame,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { HandleIndex } from '../machine/tool-machine.types';

const HANDLE_SIZE = 8;
/** How far either side of an edge, in screen pixels, a press resizes. */
const EDGE_REACH = 7;
/** How near the turning handle, in screen pixels, a press takes hold of it. */
const ROTATE_REACH = 8;

/**
 * If (px, py) — in world coords — is on one of the shape's four corner
 * handles, or anywhere along the outline between two corners, return the
 * handle index. Else return null. A side has no handle of its own: it is
 * taken hold of along its whole length, so the box can be resized from
 * wherever the pointer meets it.
 *
 * A turned shape's handles turn with it, so the press is turned back into
 * the shape's own upright frame and measured there.
 *
 * Called only when exactly one shape is selected. Shapes edited point by point
 * have no box handles to hit — see `shapeHandleAt` for those.
 */
export function hitTestHandles(
  shape: Shape,
  worldX: number,
  worldY: number,
  zoom: number,
  /** The square a press counts within, in screen pixels: bigger for a finger. */
  hitSize = HANDLE_SIZE,
): HandleIndex | null {
  if (hasPointHandles(shape) || shape.kind === 'topic') return null;

  const { x: px, y: py } = toShapeFrame(shape, { x: worldX, y: worldY });
  const b = shapeBox(shape);
  const pad = SELECTION_PAD / zoom;
  const outerBounds = {
    x: b.x - pad,
    y: b.y - pad,
    width: b.width + pad * 2,
    height: b.height + pad * 2,
  };

  const halfHandle = hitSize / 2 / zoom;
  const right = outerBounds.x + outerBounds.width;
  const bottom = outerBounds.y + outerBounds.height;

  const positions: Array<[HandleIndex, number, number]> = [
    [0, outerBounds.x, outerBounds.y],
    [2, right, outerBounds.y],
    [4, right, bottom],
    [6, outerBounds.x, bottom],
  ];

  for (const [idx, hx, hy] of positions) {
    if (
      px >= hx - halfHandle &&
      px <= hx + halfHandle &&
      py >= hy - halfHandle &&
      py <= hy + halfHandle
    ) {
      return idx;
    }
  }

  // The band either side of the selection box, wide enough to reach in over
  // the shape's own stroke just inside it. Kept to a quarter of the shorter
  // side, so a small shape still has a middle left to move it by.
  const band = Math.min(
    Math.max(halfHandle, EDGE_REACH / zoom),
    Math.min(outerBounds.width, outerBounds.height) / 4,
  );
  const withinX = px >= outerBounds.x && px <= right;
  const withinY = py >= outerBounds.y && py <= bottom;
  if (withinX && Math.abs(py - outerBounds.y) <= band) return 1;
  if (withinY && Math.abs(px - right) <= band) return 3;
  if (withinX && Math.abs(py - bottom) <= band) return 5;
  if (withinY && Math.abs(px - outerBounds.x) <= band) return 7;
  return null;
}

/** Whether (px, py) — in world coords — is on the dot that turns the shape. */
export function hitTestRotateHandle(
  shape: Shape,
  px: number,
  py: number,
  zoom: number,
  /** The square a press counts within, in screen pixels: bigger for a finger. */
  hitSize = HANDLE_SIZE,
): boolean {
  const at = rotateHandlePosition(shape, zoom);
  if (!at) return false;
  const reach = Math.max(hitSize / 2, ROTATE_REACH) / zoom;
  return Math.hypot(px - at.x, py - at.y) <= reach;
}

/** Each handle's direction out from the middle of the box, in eighths of a turn from east. */
const HANDLE_OCTANT: Record<HandleIndex, number> = {
  3: 0,
  4: 1,
  5: 2,
  6: 3,
  7: 4,
  0: 5,
  1: 6,
  2: 7,
};

/** The arrow for each eighth of a turn, east first; a resize arrow points both ways. */
const OCTANT_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

/**
 * The pointer a handle shows on hover, pointing the way it resizes — turned
 * with the shape, to the nearest of the four arrows a browser has.
 */
export function resizeCursorFor(handle: HandleIndex, shape?: Shape): string {
  const turn = shape ? shapeAngle(shape) / (Math.PI / 4) : 0;
  const octant = (((Math.round(HANDLE_OCTANT[handle] + turn) % 8) + 8) % 8) % 4;
  return OCTANT_CURSORS[octant]!;
}

/**
 * Two arrows curling round, for the dot that turns a shape — drawn dark on a
 * white edge so it reads on either board.
 */
const ROTATE_CURSOR_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
  "<g fill='none' stroke-linecap='round' stroke-linejoin='round'>" +
  "<path d='M5.5 13.5A7 7 0 0 1 18.5 13.5' stroke='white' stroke-width='4'/>" +
  "<path d='M5.5 13.5A7 7 0 0 1 18.5 13.5' stroke='black' stroke-width='1.6'/>" +
  '</g>' +
  "<path d='M2.5 12.5h6l-3 5z M15.5 12.5h6l-3 5z' fill='black' stroke='white' " +
  "stroke-width='1.2' stroke-linejoin='round'/>" +
  '</svg>';

/** The `cursor` value over the turning handle and while turning. */
export const ROTATE_CURSOR = `url("data:image/svg+xml,${ROTATE_CURSOR_SVG.replace(/</g, '%3C')
  .replace(/>/g, '%3E')
  .replace(/#/g, '%23')}") 12 12, grab`;
