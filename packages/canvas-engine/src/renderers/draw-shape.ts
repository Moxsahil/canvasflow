import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Shape } from '../shapes/shape.js';
import { assertNever } from '../shapes/shape.js';
import { drawImageShape, type ImageSource } from './draw-image.js';
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

export const ERASE_PENDING_OPACITY = 20;

/**
 * Everything a shape might need beyond its own fields.
 *
 * Only image shapes read any of it, which is why every field is optional: a
 * board with no images renders exactly as it did before, and the callers that
 * never had images to paint do not have to learn about them.
 */
export interface SceneShapeContext {
  /** Decoded bitmaps. Absent means every image paints as a placeholder. */
  readonly images?: ImageSource;
  /**
   * Whether the finished canvas will have the dark-mode filter applied over it.
   * Images pre-apply its inverse so their own colours survive it; nothing else
   * cares, because being inverted is what makes the rest of the board dark.
   */
  readonly darkMode?: boolean;
}

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
  context: SceneShapeContext = {},
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
    case 'image':
      drawImageShape(ctx, shape, context.images, context.darkMode ?? false);
      break;
    default:
      assertNever(shape);
  }

  ctx.globalAlpha = previousAlpha;
}
