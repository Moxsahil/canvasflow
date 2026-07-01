import type { Shape } from '../shapes/shape.js';
import { assertNever } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import {
  createRoughCanvas,
  generateRectangleDrawable,
  generateEllipseDrawable,
  generateDiamondDrawable,
  generateLineDrawable,
  generateArrowDrawable,
  generateFreehandDrawable,
  drawShape,
  drawArrowheads,
  drawText,
} from '../utils/rough.js';

export interface StaticSceneOptions {
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
 * Switch on shape.kind for exhaustive type-narrowing. The assertNever
 * call in the default case makes TypeScript refuse to compile if we
 * add a new shape kind and forget to handle it here.
 */
export function renderStaticScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: StaticSceneOptions,
): void {
  const { width, height, shapes, camera } = opts;

  clearCanvas(ctx, width, height);

  ctx.save();

  if (camera) {
    ctx.translate(-camera.x, -camera.y);
    ctx.scale(camera.zoom, camera.zoom);
  }

  const rc = createRoughCanvas(canvas);

  for (const shape of shapes) {
    switch (shape.kind) {
      case 'rectangle': {
        drawShape(rc, generateRectangleDrawable(rc, shape));
        break;
      }
      case 'ellipse': {
        drawShape(rc, generateEllipseDrawable(rc, shape));
        break;
      }
      case 'diamond': {
        drawShape(rc, generateDiamondDrawable(rc, shape));
        break;
      }
      case 'line': {
        drawShape(rc, generateLineDrawable(rc, shape));
        break;
      }
      case 'arrow': {
        drawShape(rc, generateArrowDrawable(rc, shape));
        drawArrowheads(ctx, shape);
        break;
      }
      case 'freehand': {
        drawShape(rc, generateFreehandDrawable(rc, shape));
        break;
      }
      case 'text': {
        drawText(ctx, shape);
        break;
      }
      default:
        assertNever(shape);
    }
  }

  ctx.restore();
}
