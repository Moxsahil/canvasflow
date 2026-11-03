import type { Rect } from '@canvasflow/canvas-engine';
import { MIN_ZOOM, type Camera } from '../machine/tool-machine.types';

/** A part of the board left clear by the chrome, in board pixels. */
export interface ClearArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The camera that shows `rect` inside `area`, or null when it already shows
 * it there.
 *
 * Centres the shapes in the clear part of the board, zooming out only when
 * they are too big for it and never zooming in. Used when a panel opens over
 * the board, so what the panel changes stays in sight beside it.
 */
export function cameraKeepingInView(rect: Rect, camera: Camera, area: ClearArea): Camera | null {
  const width = area.right - area.left;
  const height = area.bottom - area.top;
  if (width <= 0 || height <= 0) return null;

  const fits = rect.width * camera.zoom <= width && rect.height * camera.zoom <= height;
  const zoom = fits
    ? camera.zoom
    : Math.max(
        MIN_ZOOM,
        Math.min(camera.zoom, (0.9 * width) / rect.width, (0.9 * height) / rect.height),
      );

  const left = (rect.x - camera.x) * camera.zoom;
  const top = (rect.y - camera.y) * camera.zoom;
  const inside =
    zoom === camera.zoom &&
    left >= area.left &&
    top >= area.top &&
    left + rect.width * zoom <= area.right &&
    top + rect.height * zoom <= area.bottom;
  if (inside) return null;

  const screenX = area.left + (width - rect.width * zoom) / 2;
  const screenY = area.top + (height - rect.height * zoom) / 2;
  return { x: rect.x - screenX / zoom, y: rect.y - screenY / zoom, zoom };
}
