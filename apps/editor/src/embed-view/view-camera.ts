import { fitRectToViewport, type Rect } from '@canvasflow/canvas-engine';
import { MAX_ZOOM, MIN_ZOOM, type Camera } from '../machine/tool-machine.types';

/**
 * Where the embed page looks. The same camera the editor has — a point on the
 * board at the top-left corner and a zoom — so a point on screen is
 * `(world - camera) * zoom`.
 */

/** Room left around the board when it is fitted to the frame, in screen pixels. */
export const FIT_PADDING = 32;

/** Zoom steps by this much a click, as the editor's buttons do. */
const ZOOM_STEP = 1.2;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The camera that shows all of `region` in a `width` × `height` frame,
 * centred. Never closer than 100%: a board of three sticky notes should look
 * like three sticky notes, not a poster of them.
 */
export function fitCamera(region: Rect, width: number, height: number): Camera {
  return fitRectToViewport(region, { width, height }, { padding: FIT_PADDING, maxZoom: 1 });
}

/** Zoom to `zoom`, keeping the point under `screen` where it is. */
export function zoomAt(camera: Camera, screen: { x: number; y: number }, zoom: number): Camera {
  const next = clampZoom(zoom);
  const worldX = screen.x / camera.zoom + camera.x;
  const worldY = screen.y / camera.zoom + camera.y;
  return { x: worldX - screen.x / next, y: worldY - screen.y / next, zoom: next };
}

/** One step in or out, about the middle of the frame. */
export function zoomStep(camera: Camera, direction: 1 | -1, width: number, height: number): Camera {
  const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  return zoomAt(camera, { x: width / 2, y: height / 2 }, camera.zoom * factor);
}

/** Move the view by a drag of `dx`, `dy` screen pixels. */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom };
}

/** The board point under a screen point. */
export function toWorld(camera: Camera, screen: { x: number; y: number }) {
  return { x: screen.x / camera.zoom + camera.x, y: screen.y / camera.zoom + camera.y };
}
