import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Shape } from '../shapes/shape.js';
import { assertNever, fontSizeOf } from '../shapes/shape.js';
import { strokeColorFor } from '../shapes/style.js';
import { drawImageShape, type ImageSource } from './draw-image.js';
import { drawFrameBody } from './draw-frame.js';
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
 * The shape as the current board should paint it.
 *
 * Returns the shape itself unless the theme actually changes a colour, so the
 * common case allocates nothing: this runs for every shape of every frame.
 */
function withThemedStroke<T extends Shape>(shape: T, darkMode: boolean): T {
  const strokeColor = strokeColorFor(shape.strokeColor, darkMode);
  return strokeColor === shape.strokeColor ? shape : { ...shape, strokeColor };
}

/**
 * Everything a shape might need beyond its own fields.
 *
 * Every field is optional, so a caller with no images to paint and no theme to
 * honour renders exactly as it did before and does not have to learn about
 * either.
 */
export interface SceneShapeContext {
  /** Decoded bitmaps. Absent means every image paints as a placeholder. */
  readonly images?: ImageSource;
  /**
   * Which board this shape is being painted on. Only the default stroke reads
   * it, to paint as ink rather than as near-black on a near-black ground.
   */
  readonly darkMode?: boolean;
  /**
   * Current zoom. Only frames read it, to hold their border and label at a
   * constant weight on screen; every other shape is drawn in world units.
   */
  readonly zoom?: number;
  /** Frames whose name is open for editing, drawn in the selection colour. */
  readonly editingFrameIds?: ReadonlySet<string>;
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

  const painted = withThemedStroke(shape, context.darkMode ?? false);

  switch (painted.kind) {
    case 'rectangle':
      drawShape(rc, generateRectangleDrawable(rc, painted));
      break;
    case 'ellipse':
      drawShape(rc, generateEllipseDrawable(rc, painted));
      break;
    case 'diamond':
      drawShape(rc, generateDiamondDrawable(rc, painted));
      break;
    case 'line':
      drawShape(rc, generateLineDrawable(rc, painted));
      break;
    case 'arrow':
      drawShape(rc, generateArrowDrawable(rc, painted));
      drawArrowheads(ctx, painted);
      break;
    case 'freehand': {
      const fill = generateFreehandFillDrawable(rc, painted);
      if (fill) drawShape(rc, fill);

      if (painted.simulatePressure) {
        drawFreehandPressure(ctx, painted);
      } else {
        drawShape(rc, generateFreehandDrawable(rc, painted));
      }
      break;
    }
    case 'text':
      drawText(ctx, { ...painted, fontSize: fontSizeOf(painted) });
      break;
    case 'image':
      drawImageShape(ctx, painted, context.images);
      break;
    // Body only. The label is chrome sized in screen pixels, so it needs the
    // zoom the scene renderer has and this function does not.
    case 'frame':
      drawFrameBody(ctx, painted, {
        zoom: context.zoom ?? 1,
        highlight: context.editingFrameIds?.has(painted.id),
      });
      break;
    default:
      assertNever(painted);
  }

  ctx.globalAlpha = previousAlpha;
}
