import type { Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import { createRoughCanvas } from '../utils/rough.js';
import { drawSceneShape } from './draw-shape.js';

export interface StaticSceneOptions {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly Shape[];
  /** Shapes the eraser has marked but not yet deleted; drawn faded. */
  readonly pendingErasureIds?: ReadonlySet<string>;
  readonly camera?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}

/**
 * Paint all finished shapes to the static canvas.
 *
 * Per-shape painting lives in drawSceneShape, shared with the new-element
 * renderer, so exhaustiveness over shape kinds is checked in one place.
 */
export function renderStaticScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: StaticSceneOptions,
): void {
  const { width, height, shapes, camera, pendingErasureIds } = opts;

  clearCanvas(ctx, width, height);

  ctx.save();

  if (camera) {
    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
  }

  const rc = createRoughCanvas(canvas);

  for (const shape of shapes) {
    drawSceneShape(ctx, rc, shape, pendingErasureIds?.has(shape.id) ?? false);
  }

  ctx.restore();
}
