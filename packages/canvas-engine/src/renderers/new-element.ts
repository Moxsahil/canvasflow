import type { Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import { createRoughCanvas } from '../utils/rough.js';
import { drawSceneShape, type SceneShapeContext } from './draw-shape.js';

export interface NewElementSceneOptions extends SceneShapeContext {
  readonly width: number;
  readonly height: number;
  readonly newElement: Shape | null;
  readonly camera?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}

export function renderNewElementScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: NewElementSceneOptions,
): void {
  const { width, height, newElement, camera, images, darkMode } = opts;

  clearCanvas(ctx, width, height);

  if (!newElement) return;

  ctx.save();

  if (camera) {
    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
  }

  drawSceneShape(ctx, createRoughCanvas(canvas), newElement, false, { images, darkMode });

  ctx.restore();
}
