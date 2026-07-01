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

  const rc = createRoughCanvas(canvas);

  switch (newElement.kind) {
    case 'rectangle': {
      drawShape(rc, generateRectangleDrawable(rc, newElement));
      break;
    }
    case 'ellipse': {
      drawShape(rc, generateEllipseDrawable(rc, newElement));
      break;
    }
    case 'diamond': {
      drawShape(rc, generateDiamondDrawable(rc, newElement));
      break;
    }
    case 'line': {
      drawShape(rc, generateLineDrawable(rc, newElement));
      break;
    }
    case 'arrow': {
      drawShape(rc, generateArrowDrawable(rc, newElement));
      drawArrowheads(ctx, newElement);
      break;
    }
    case 'freehand': {
      drawShape(rc, generateFreehandDrawable(rc, newElement));
      break;
    }
    case 'text': {
      drawText(ctx, newElement);
      break;
    }
    default:
      assertNever(newElement);
  }

  ctx.restore();
}
