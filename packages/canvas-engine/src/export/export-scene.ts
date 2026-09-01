import type { Shape } from '../shapes/shape.js';
import { unionRect, type Rect } from '../math.js';
import { framesIn } from '../frames/membership.js';
import { frameLabelBounds } from '../frames/frame-geometry.js';
import { computeBoundingRect } from '../document/camera.js';
import { renderStaticScene } from '../renderers/static.js';
import { DARK_EXPORT_FILTER } from '../theme-filter.js';
import type { ImageSource } from '../renderers/draw-image.js';

export const DEFAULT_EXPORT_PADDING = 10;

export { DARK_EXPORT_FILTER };

export interface ExportSceneOptions {
  /** World-unit margin around the content. */
  readonly padding?: number;
  /** Pixel multiplier — 1×, 2×, 3×. Geometry is unchanged; only resolution. */
  readonly scale?: number;
  /** Painted behind the shapes. Omit for a transparent image. */
  readonly backgroundColor?: string | null;
  /**
   * Decoded bitmaps for any image shapes, keyed by file id. A canvas export
   * paints from these; without them images come out as empty outlines.
   */
  readonly images?: ImageSource;
  /**
   * Image bytes as data URIs, keyed by file id, for the SVG path only.
   *
   * SVG needs the payload rather than the decoded bitmap, because the export
   * has to stay readable on a machine that has never authenticated with us.
   * Resolving them is asynchronous, so it happens before the renderer is
   * called rather than inside it — the string builder stays synchronous and
   * free of any dependency on the DOM.
   */
  readonly imageDataUrls?: ReadonlyMap<string, string>;
  /** Whether the export will have the dark-mode filter applied over it. */
  readonly darkMode?: boolean;
  /**
   * The world rectangle to cover, instead of the box the shapes happen to fill.
   *
   * What makes an export a crop rather than a photograph of whatever is there.
   * Exporting a frame passes its own rectangle, so the file comes out the size
   * the frame promised however far its contents overhang — a shape sticking
   * out cannot silently change the dimensions of the image.
   */
  readonly region?: Rect;
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

/**
 * The world rectangle an export covers, padding included.
 *
 * The one place the area is decided, so the measured size, the canvas camera
 * and the SVG viewBox cannot disagree about where the image starts.
 */
export function exportRegion(
  shapes: readonly Shape[],
  { region, padding = DEFAULT_EXPORT_PADDING, scale = 1 }: ExportSceneOptions = {},
): Rect {
  // A named region is the crop exactly. Padding is what turns a content
  // bounding box into something with room to breathe around it; a caller that
  // has already said where the edges go has decided that question.
  if (region) return region;

  let rect = computeBoundingRect(shapes);
  if (!rect) throw new EmptySceneError();

  // A frame draws its name above its own top edge, outside the bounds every
  // other part of the system knows it by. Fitted to the shapes alone the box
  // stops short and the labels come out sliced through the middle.
  for (const frame of framesIn(shapes)) {
    rect = unionRect(rect, frameLabelBounds(frame, scale));
  }

  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/** The area an export will cover, before any canvas exists. */
export function measureExportSize(
  shapes: readonly Shape[],
  options: ExportSceneOptions = {},
): ExportSceneSize {
  const { width, height } = exportRegion(shapes, options);
  const scale = options.scale ?? 1;
  return {
    width: Math.max(1, Math.ceil(width * scale)),
    height: Math.max(1, Math.ceil(height * scale)),
  };
}

export function renderSceneToCanvas(
  canvas: CanvasLike,
  shapes: readonly Shape[],
  options: ExportSceneOptions = {},
): ExportSceneSize {
  const { scale = 1, backgroundColor, images, darkMode } = options;

  const region = exportRegion(shapes, options);
  const size = measureExportSize(shapes, options);
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
    images,
    darkMode,
    // Placing the region's top-left at the canvas origin.
    camera: { x: region.x, y: region.y, zoom: scale },
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
