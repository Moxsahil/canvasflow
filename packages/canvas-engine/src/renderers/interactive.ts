import type { Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas';

export interface InteractiveSceneOptions {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly Shape[];
  readonly selectedIds: readonly string[];
  readonly camera?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}

/**
 * Paint the interactive overlay — selection bounding boxes, resize handles,
 * remote collaborator cursors.
 *
 * This canvas repaints often (on every mouse-move during selection), but
 * the static canvas underneath stays cached. That's the perf win.
 *
 */
export function renderInteractiveScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  _canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: InteractiveSceneOptions,
): void {
  const { width, height, shapes, selectedIds, camera } = opts;

  clearCanvas(ctx, width, height);
  if (selectedIds.length === 0) return;

  ctx.save();
  if (camera) {
    ctx.translate(-camera.x, -camera.y);
    ctx.scale(camera.zoom, camera.zoom);
  }

  // Selection bounding box outlines
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 1.5 / (camera?.zoom ?? 1);
  ctx.setLineDash([8 / (camera?.zoom ?? 1), 4 / (camera?.zoom ?? 1)]);

  for (const shape of shapes) {
    if (!selectedIds.includes(shape.id)) continue;
    if (shape.kind === 'rectangle') {
      ctx.strokeRect(shape.x - 4, shape.y - 4, shape.width + 8, shape.height + 8);
    }
  }

  ctx.setLineDash([]);
  ctx.restore();
}
