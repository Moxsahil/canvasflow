import type { ImageShape } from '../shapes/shape.js';
import { DARK_IMAGE_COMPENSATION_FILTER } from '../theme-filter.js';

/**
 * Read-only view of decoded bitmaps, as the renderer needs them.
 *
 * Deliberately synchronous and deliberately tiny: `drawSceneShape` runs inside
 * a paint that cannot await, so the renderer's only question is "do you have
 * this one right now". Everything about fetching, decoding and retrying lives
 * behind this interface, which also lets a test paint from a plain Map.
 */
export interface ImageSource {
  get(fileId: string): CanvasImageSource | null;
}

/** Placeholder body, light and dark. Muted enough to read as "not content yet". */
const PLACEHOLDER_FILL = '#e9e9ed';
const PLACEHOLDER_STROKE = '#c6c6cf';
const ERROR_FILL = '#f5e0e0';
const ERROR_STROKE = '#d9b0b0';
const GLYPH_COLOR = '#8a8a96';

/** Fraction of the shorter side the placeholder glyph occupies. */
const GLYPH_SCALE = 0.32;
const GLYPH_MAX = 64;

/**
 * A mountain-and-sun mark, drawn with plain canvas paths.
 *
 * Drawn rather than blitted from an SVG data URI because the placeholder has to
 * appear on the very first paint: loading an icon image would mean the empty
 * box flashes before the thing that explains the empty box.
 */
function drawPlaceholderGlyph(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const half = size / 2;
  const left = cx - half;
  const top = cy - half;

  ctx.save();
  ctx.strokeStyle = GLYPH_COLOR;
  ctx.fillStyle = GLYPH_COLOR;
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeRect(left, top, size, size);

  ctx.beginPath();
  ctx.arc(left + size * 0.32, top + size * 0.3, size * 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(left + size * 0.1, top + size * 0.78);
  ctx.lineTo(left + size * 0.38, top + size * 0.48);
  ctx.lineTo(left + size * 0.62, top + size * 0.72);
  ctx.lineTo(left + size * 0.76, top + size * 0.58);
  ctx.lineTo(left + size * 0.9, top + size * 0.78);
  ctx.stroke();

  ctx.restore();
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ImageShape,
): void {
  const failed = shape.status === 'error';

  ctx.save();
  ctx.fillStyle = failed ? ERROR_FILL : PLACEHOLDER_FILL;
  ctx.strokeStyle = failed ? ERROR_STROKE : PLACEHOLDER_STROKE;
  ctx.lineWidth = 1;
  ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
  ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  ctx.restore();

  const shortest = Math.min(shape.width, shape.height);
  const glyph = Math.min(shortest * GLYPH_SCALE, GLYPH_MAX);
  // Below this the glyph is noise rather than information, and its stroke
  // would swamp the box it is drawn inside.
  if (glyph < 8) return;

  drawPlaceholderGlyph(ctx, shape.x + shape.width / 2, shape.y + shape.height / 2, glyph);
}

/**
 * Paint one image shape, or a placeholder standing in for it.
 *
 * A missing bitmap is the normal case rather than an error: a collaborator sees
 * the shape the instant it is drawn and the bytes arrive over a separate
 * request some milliseconds later. The placeholder holds the exact space the
 * image will occupy, so nothing on the board shifts when it lands.
 */
export function drawImageShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ImageShape,
  images: ImageSource | undefined,
  darkMode: boolean,
): void {
  const bitmap = images?.get(shape.fileId) ?? null;

  if (!bitmap) {
    drawPlaceholder(ctx, shape);
    return;
  }

  ctx.save();
  // The board-wide dark filter is applied to the finished canvas, so an image
  // has to arrive at that filter already carrying its own inverse. The
  // placeholder above deliberately does not: it is chrome, and should invert
  // with the rest of the board.
  if (darkMode && 'filter' in ctx) {
    ctx.filter = DARK_IMAGE_COMPENSATION_FILTER;
  }
  ctx.drawImage(bitmap, shape.x, shape.y, shape.width, shape.height);
  ctx.restore();
}
