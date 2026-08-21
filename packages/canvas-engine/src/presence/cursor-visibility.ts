import type { PresenceCamera, PresencePoint, PresenceScreen } from './presence-state.js';

/**
 * Screen-space slack so a cursor is not culled the instant its hotspot crosses
 * the edge — the glyph and its name tag extend right and down from that point.
 */
const MARGIN_X_PX = 12;
const MARGIN_Y_PX = 16;

/** Convert a world point to screen pixels under a camera. */
export function worldToScreen(
  point: PresencePoint,
  camera: PresenceCamera,
): { x: number; y: number } {
  return {
    x: (point.x - camera.x) * camera.zoom,
    y: (point.y - camera.y) * camera.zoom,
  };
}

/**
 * Whether a cursor falls inside the visible area.
 *
 * The margin is applied in screen space, so the slack stays the same physical
 * size at every zoom level rather than growing as you zoom out.
 */
export function isCursorVisible(
  point: PresencePoint,
  camera: PresenceCamera,
  screen: PresenceScreen,
): boolean {
  const { x, y } = worldToScreen(point, camera);
  return (
    x >= -MARGIN_X_PX &&
    y >= -MARGIN_Y_PX &&
    x <= screen.width + MARGIN_X_PX &&
    y <= screen.height + MARGIN_Y_PX
  );
}

export interface EdgeHint {
  /** Clamped position on the viewport border, in screen pixels. */
  readonly x: number;
  readonly y: number;
  /** Direction from the viewport centre toward the peer, in radians. */
  readonly angle: number;
}

/**
 * Where to draw the marker for a peer who is off screen, and which way it
 * points.
 *
 * Only meaningful when {@link isCursorVisible} is false; the caller is expected
 * to have checked. Inset from the border so the marker sits fully on screen
 * rather than half-clipped.
 */
export function edgeHintFor(
  point: PresencePoint,
  camera: PresenceCamera,
  screen: PresenceScreen,
  inset = 16,
): EdgeHint {
  const { x, y } = worldToScreen(point, camera);
  const centerX = screen.width / 2;
  const centerY = screen.height / 2;

  return {
    x: Math.min(Math.max(x, inset), Math.max(inset, screen.width - inset)),
    y: Math.min(Math.max(y, inset), Math.max(inset, screen.height - inset)),
    // From the centre rather than from the clamped point: the clamped position
    // sits on the border, so measuring from it would flatten the angle to
    // nearly horizontal or vertical and stop indicating where the peer is.
    angle: Math.atan2(y - centerY, x - centerX),
  };
}
