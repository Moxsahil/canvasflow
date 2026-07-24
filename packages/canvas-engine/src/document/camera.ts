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
