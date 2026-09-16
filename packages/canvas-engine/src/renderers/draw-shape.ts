import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { ArrowShape, Shape } from '../shapes/shape.js';
import { assertNever, fontSizeOf } from '../shapes/shape.js';
import { arrowInkBounds } from '../shapes/arrow.js';
import { arrowLabelLayout, type ArrowLabelLayout } from '../shapes/arrow-label.js';
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
 * Clip the arrow's ink to everything outside its label.
 *
 * Even-odd over two rectangles — everything the arrow can paint, and the
 * label's own box, which the rule turns into a hole. The line is generated as
 * one jittered path, so breaking it any other way would mean splitting a path
 * we did not draw.
 */
function clipOutsideLabel(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ArrowShape,
  box: ArrowLabelLayout['box'],
): void {
  const outer = arrowInkBounds(shape);

  ctx.beginPath();
  ctx.rect(outer.x, outer.y, outer.width, outer.height);
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip('evenodd');
}

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
  /**
   * The arrow whose label is open in the text overlay, if one is.
   *
   * Its gap is cut to what is being typed — and cut at all, even before the
   * first character — while the glyphs are left to the overlay that owns the
   * caret. Drawing them here as well would double them, a pixel out of step.
   *
   * One id rather than a set: there is a single text overlay.
   */
  readonly editingArrowLabelId?: string;
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
    case 'arrow': {
      const beingTyped = painted.id === context.editingArrowLabelId;
      const label = arrowLabelLayout(painted, { caret: beingTyped });
      if (label) {
        ctx.save();
        clipOutsideLabel(ctx, painted, label.box);
      }
      drawShape(rc, generateArrowDrawable(rc, painted));
      drawArrowheads(ctx, painted);
      if (label) {
        ctx.restore();
        // While the overlay holds the caret it draws the words too; all this
        // layer owes them is the gap to sit in.
        if (!beingTyped) {
          drawText(ctx, {
            x: label.anchor.x,
            y: label.textTop,
            text: label.lines.join('\n'),
            fontSize: label.fontSize,
            fontFamily: label.fontFamily,
            textAlign: 'center',
            strokeColor: painted.strokeColor,
          });
        }
      }
      break;
    }
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
