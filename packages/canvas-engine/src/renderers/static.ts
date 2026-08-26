import type { Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import { createRoughCanvas } from '../utils/rough.js';
import { drawSceneShape, type SceneShapeContext } from './draw-shape.js';

export interface StaticSceneOptions extends SceneShapeContext {
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
  /**
   * Painted over the full canvas before any shape. The live editor leaves this
   * unset and lets the container's CSS paint the board colour, but an export
   * has no container — the pixels are the whole artifact, so the renderer has
   * to lay the background down itself (or not, for a transparent image).
   */
  readonly backgroundColor?: string | null;
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
  const { width, height, shapes, camera, pendingErasureIds, backgroundColor, images, darkMode } =
    opts;

  clearCanvas(ctx, width, height);

  // Before the camera transform, so it covers the canvas rather than a
  // camera-sized rectangle somewhere in world space.
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();

  if (camera) {
    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
  }

  const rc = createRoughCanvas(canvas);

  for (const shape of shapes) {
    drawSceneShape(ctx, rc, shape, pendingErasureIds?.has(shape.id) ?? false, {
      images,
      darkMode,
    });
  }

  ctx.restore();
}
