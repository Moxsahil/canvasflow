import type { Shape } from '../shapes/shape.js';
import { computeBoundingRect } from '../document/camera.js';
import { renderStaticScene } from '../renderers/static.js';

export const DEFAULT_EXPORT_PADDING = 10;

/**
 * The colour transform dark mode applies. Identical to the CSS `--theme-filter`
 * the editor paints the live canvas with, so a dark export matches the dark
 * board exactly rather than approximately.
 */
export const DARK_EXPORT_FILTER = 'invert(93%) hue-rotate(180deg)';

export interface ExportSceneOptions {
  /** World-unit margin around the content. */
  readonly padding?: number;
  /** Pixel multiplier — 1×, 2×, 3×. Geometry is unchanged; only resolution. */
  readonly scale?: number;
  /** Painted behind the shapes. Omit for a transparent image. */
  readonly backgroundColor?: string | null;
}

export interface ExportSceneSize {
  /** Bitmap size, padding and scale included. */
  readonly width: number;
  readonly height: number;
}

/** Nothing to export — the caller decides how to tell the user. */
export class EmptySceneError extends Error {
  constructor() {
    super('There is nothing on the canvas to export.');
    this.name = 'EmptySceneError';
  }
}

interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}

/** The area an export will cover, before any canvas exists. */
export function measureExportSize(
  shapes: readonly Shape[],
  { padding = DEFAULT_EXPORT_PADDING, scale = 1 }: ExportSceneOptions = {},
): ExportSceneSize {
  const rect = computeBoundingRect(shapes);
  if (!rect) throw new EmptySceneError();
  return {
    width: Math.max(1, Math.ceil((rect.width + padding * 2) * scale)),
    height: Math.max(1, Math.ceil((rect.height + padding * 2) * scale)),
  };
}

export function renderSceneToCanvas(
  canvas: CanvasLike,
  shapes: readonly Shape[],
  options: ExportSceneOptions = {},
): ExportSceneSize {
  const { padding = DEFAULT_EXPORT_PADDING, scale = 1, backgroundColor } = options;

  const rect = computeBoundingRect(shapes);
  if (!rect) throw new EmptySceneError();

  const size = measureExportSize(shapes, { padding, scale });
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for export');

  renderStaticScene(ctx, canvas as unknown as HTMLCanvasElement, {
    width: size.width,
    height: size.height,
    shapes,
    // Painted by the renderer, which clears the canvas first — filling here
    // would just be erased. Omitting it is what makes a transparent PNG.
    backgroundColor,
    // Placing the padded top-left of the content at the canvas origin.
    camera: { x: rect.x - padding, y: rect.y - padding, zoom: scale },
  });

  return size;
}

/**
 * Apply the dark theme to an already-rendered export canvas.
 *
 * Done as a filtered copy rather than by transforming each shape's colour: the
 * editor shows dark mode by putting this exact filter over the live canvas, so
 * running the same operation over the same pixels is the only way the file is
 * guaranteed to match the screen.
 *
 * It has to be a *copy* — filtering the composited image, not each draw call.
 * Setting the filter before rendering would apply it per shape, which differs
 * wherever shapes overlap or are translucent, and would no longer match what
 * the screen shows.
 *
 * Returns false where `ctx.filter` isn't supported, so a caller can report the
 * gap rather than silently save a light image the user asked to be dark.
 */
export function applyDarkFilter(source: CanvasLike, target: CanvasLike): boolean {
  const ctx = target.getContext('2d');
  if (!ctx) return false;
  if (!('filter' in ctx)) return false;

  target.width = source.width;
  target.height = source.height;
  ctx.filter = DARK_EXPORT_FILTER;
  (ctx as CanvasRenderingContext2D).drawImage(source as unknown as HTMLCanvasElement, 0, 0);
  ctx.filter = 'none';
  return true;
}
