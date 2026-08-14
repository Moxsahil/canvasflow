import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Shape } from '../shapes/shape.js';
import { assertNever } from '../shapes/shape.js';
import {
  generateRectangleDrawable,
  generateEllipseDrawable,
  generateDiamondDrawable,
  generateLineDrawable,
  generateArrowDrawable,
  generateFreehandDrawable,
  generateFreehandFillDrawable,
  drawShape,
  drawArrowheads,
  drawFreehandPressure,
  drawText,
} from '../utils/rough.js';

/** How far a shape fades once the eraser has marked it. Excalidraw's value. */
export const ERASE_PENDING_OPACITY = 20;

/**
 * Paint one shape. Shared by the static and new-element renderers so a shape
 * in progress looks exactly like the same shape once committed.
 *
 * Opacity multiplies into whatever alpha the caller already set, rather than
 * overwriting it, and is restored afterwards so shapes can't leak state.
 * A shape awaiting erasure is multiplied down again, so it always reads as
 * fainter than it was — never accidentally brighter.
 */
export function drawSceneShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rc: RoughCanvas,
  shape: Shape,
  pendingErasure = false,
): void {
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha =
    previousAlpha * (shape.opacity / 100) * (pendingErasure ? ERASE_PENDING_OPACITY / 100 : 1);

  switch (shape.kind) {
    case 'rectangle':
      drawShape(rc, generateRectangleDrawable(rc, shape));
      break;
    case 'ellipse':
      drawShape(rc, generateEllipseDrawable(rc, shape));
      break;
    case 'diamond':
      drawShape(rc, generateDiamondDrawable(rc, shape));
      break;
    case 'line':
      drawShape(rc, generateLineDrawable(rc, shape));
      break;
    case 'arrow':
      drawShape(rc, generateArrowDrawable(rc, shape));
      drawArrowheads(ctx, shape);
      break;
    case 'freehand': {
      const fill = generateFreehandFillDrawable(rc, shape);
      if (fill) drawShape(rc, fill);

      if (shape.simulatePressure) {
        drawFreehandPressure(ctx, shape);
      } else {
        drawShape(rc, generateFreehandDrawable(rc, shape));
      }
      break;
    }
    case 'text':
      drawText(ctx, shape);
      break;
    default:
      assertNever(shape);
  }

  ctx.globalAlpha = previousAlpha;
}
