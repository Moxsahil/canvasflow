import type { Shape } from '../shapes/shape.js';
import { shapeBounds } from '../shapes/bounds.js';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Compute the axis-aligned bounding box that contains all given shapes.
 * Returns null if the shapes array is empty.
 */
export function computeBoundingRect(
  shapes: readonly Shape[],
): { x: number; y: number; width: number; height: number } | null {
  if (shapes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    const b = shapeBounds(shape);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Whether any part of a world-space rectangle currently falls on screen.
 *
 * Screen space is `(world - camera) * zoom`, the same transform the canvases
 * render with. Used to tell "there is nothing on this board" apart from "the
 * board's content is somewhere the camera isn't pointing" — which look
 * identical to the user, and are fixed very differently.
 */
export function rectIntersectsViewport(
  rect: { x: number; y: number; width: number; height: number },
  camera: Camera,
  viewport: Viewport,
): boolean {
  const left = (rect.x - camera.x) * camera.zoom;
  const top = (rect.y - camera.y) * camera.zoom;
  const right = left + rect.width * camera.zoom;
  const bottom = top + rect.height * camera.zoom;

  return right > 0 && bottom > 0 && left < viewport.width && top < viewport.height;
}

/**
 * Compute a camera that fits the given rectangle into the viewport with padding.
 * Zoom is clamped to a sensible max so a tiny shape doesn't zoom to 500%.
 */
export function fitRectToViewport(
  rect: { x: number; y: number; width: number; height: number },
  viewport: Viewport,
  options: { padding?: number; maxZoom?: number; minZoom?: number } = {},
): Camera {
  const padding = options.padding ?? 60;
  const maxZoom = options.maxZoom ?? 2; // Don't over-zoom small shapes
  const minZoom = options.minZoom ?? 0.1;

  if (rect.width === 0 || rect.height === 0) {
    // Zero-size rect — center on it at 100%
    return {
      x: rect.x - viewport.width / 2,
      y: rect.y - viewport.height / 2,
      zoom: 1,
    };
  }

  const availableWidth = viewport.width - padding * 2;
  const availableHeight = viewport.height - padding * 2;

  const zoomX = availableWidth / rect.width;
  const zoomY = availableHeight / rect.height;
  const rawZoom = Math.min(zoomX, zoomY);
  const zoom = Math.max(minZoom, Math.min(maxZoom, rawZoom));

  // Center the rect in the viewport
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  return {
    x: centerX - viewport.width / (2 * zoom),
    y: centerY - viewport.height / (2 * zoom),
    zoom,
  };
}
