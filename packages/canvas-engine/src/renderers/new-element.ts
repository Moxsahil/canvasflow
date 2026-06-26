import type { Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas';
import { createRoughCanvas, drawShape, generateRectangleDrawable } from '../utils/rough.js';

export interface NewElementSceneOptions {
  readonly width: number;
  readonly height: number;
  readonly newElement: Shape | null;
  readonly camera?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}

/**
 * Paint the shape being actively drawn (e.g., a rectangle the user is
 * dragging out right now).
 *
 * This canvas repaints every frame during a drag. Separated from static
 * so we don't re-render 2000 shapes 60 times a second.
 */

export function renderNewElementScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: NewElementSceneOptions,
): void {
  const { width, height, newElement, camera } = opts;

  clearCanvas(ctx, width, height);

  if (!newElement) return;

  ctx.save();

  if (camera) {
    ctx.translate(-camera.x, -camera.y);
    ctx.scale(camera.zoom, camera.zoom);
  }
  if (newElement.kind === 'rectangle') {
    const rc = createRoughCanvas(canvas);
    const drawable = generateRectangleDrawable(rc, newElement);
    drawShape(rc, drawable);
  }
  ctx.restore();
}
