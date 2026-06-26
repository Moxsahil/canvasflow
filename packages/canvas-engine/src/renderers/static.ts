import { isRectangle } from '../shapes';
import type { Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas';
import { createRoughCanvas, drawShape, generateRectangleDrawable } from '../utils/rough';

export interface StaticSceneAOptions {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly Shape[];
  readonly camera?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}

/**
 * Paint all finished shapes to the static canvas.
 *
 * This canvas is the "background" — it holds everything that isn't being
 * actively edited. It repaints only when the scene changes, not on every
 * pointer event.
 */

export function renderStaticScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: StaticSceneAOptions,
): void {
  const { height, width, shapes, camera } = opts;

  clearCanvas(ctx, height, width);

  // Save the un-transformed context, then apply camera transform
  ctx.save();

  if (camera) {
    ctx.translate(-camera.x, -camera.y);
    ctx.scale(camera.zoom, camera.zoom);
  }

  const rc = createRoughCanvas(canvas);

  for (const shape of shapes) {
    if (isRectangle(shape)) {
      const drawable = generateRectangleDrawable(rc, shape);
      drawShape(rc, drawable);
    }
    //TODO: ellipse, line, arrow etc. Each adds a case here
  }
  ctx.restore();
}
