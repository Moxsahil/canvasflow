import type { Camera } from '../machine/tool-machine.types';
/**
 * Extract a raw canvas-local point from a pointer event (screen pixel coords,
 * not world coords). Used for pan gestures where we care about screen deltas.
 */

export function eventToCanvasScreen(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

/**
 * Convert screen-space (pixel) coordinates to world-space (canvas) coordinates.
 * Screen space is what pointer events give you. World space is what shapes live in.
 *
 * Math:
 *   world = (screen - canvasOrigin) / zoom + camera
 *
 * Where:
 *   - canvasOrigin is the top-left of the canvas element on the page
 *   - zoom is the current zoom factor
 *   - camera is where the top-left of the viewport looks at in world space
 */

export function screenToWorld(
  screenX: number,
  screenY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (screenX - rect.left) / camera.zoom + camera.x,
    y: (screenY - rect.top) / camera.zoom + camera.y,
  };
}
