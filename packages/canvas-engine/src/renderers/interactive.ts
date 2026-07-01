import type { Shape } from '../shapes/shape.js';
import { assertNever } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import { rectangleBounds } from '../shapes/rectangle.js';
import { ellipseBounds } from '../shapes/ellipse.js';
import { diamondBounds } from '../shapes/diamond.js';
import { lineBounds } from '../shapes/line.js';
import { arrowBounds } from '../shapes/arrow.js';
import { freehandBounds } from '../shapes/freehand.js';
import { textBoundsEstimate } from '../shapes/text.js';
import type { Rect } from '../math.js';

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

function shapeBounds(shape: Shape): Rect {
  switch (shape.kind) {
    case 'rectangle':
      return rectangleBounds(shape);
    case 'ellipse':
      return ellipseBounds(shape);
    case 'diamond':
      return diamondBounds(shape);
    case 'line':
      return lineBounds(shape);
    case 'arrow':
      return arrowBounds(shape);
    case 'freehand':
      return freehandBounds(shape);
    case 'text':
      return textBoundsEstimate(shape);
    default:
      assertNever(shape);
  }
}

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

  const zoom = camera?.zoom ?? 1;
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([8 / zoom, 4 / zoom]);

  for (const shape of shapes) {
    if (!selectedIds.includes(shape.id)) continue;
    const b = shapeBounds(shape);
    ctx.strokeRect(b.x - 4, b.y - 4, b.width + 8, b.height + 8);
  }

  ctx.setLineDash([]);
  ctx.restore();
}
