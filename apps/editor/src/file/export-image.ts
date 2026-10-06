import {
  descendantsOf,
  frameBounds,
  isFrame,
  measureExportSize,
  renderSceneToCanvas,
  renderSceneToSvgString,
  shapesForFrameExport,
  SVG_DOCUMENT_PREAMBLE,
  type ImageSource,
  type Rect,
  type Shape,
} from '@canvasflow/canvas-engine';
import { writeClipboardItem } from '../clipboard/clipboard-ops';

export const EXPORT_SCALES = [1, 2, 3] as const;

const MAX_EXPORT_PIXELS = 64_000_000;

export interface ImageExportSettings {
  /** Carry the board inside the file, so the image re-opens as a board. */
  embedScene: boolean;
  /** 1×, 2×, 3× — resolution for PNG, natural size for SVG. */
  scale: number;
  /** Off gives a transparent PNG / no background rect in the SVG. */
  withBackground: boolean;
  /** Export as the dark theme shows it. */
  dark: boolean;
  /** The board's own background colour, used when `withBackground`. */
  backgroundColor: string;
  /**
   * The world rectangle to cover, when the export is a crop rather than
   * everything the shapes fill. Set when exporting a single frame.
   */
  region?: Rect;
}

export class ExportTooLargeError extends Error {
  constructor() {
    super('That export is too large. Try a smaller scale.');
    this.name = 'ExportTooLargeError';
  }
}

/**
 * The selection with everything standing in its frames, in board order.
 *
 * A frame is selected on its own, and every operation that treats it as one
 * object brings its contents along — so must anything that copies or exports
 * it. Taken from `shapes`, so a shape missing there (hidden, say) stays out.
 */
export function withFrameMembers(
  selected: readonly Shape[],
  shapes: readonly Shape[],
): readonly Shape[] {
  const ids = new Set(selected.map((shape) => shape.id));
  for (const frame of selected.filter(isFrame)) {
    for (const member of descendantsOf(frame.id, shapes)) ids.add(member.id);
  }
  return shapes.filter((shape) => ids.has(shape.id));
}

/** What an image of the board covers: the shapes to draw, and a crop if there is one. */
export interface ExportScope {
  readonly shapes: readonly Shape[];
  /** Set when the image is one frame, cut to the frame's edge. */
  readonly region?: Rect;
}

/**
 * The image a selection asks for.
 *
 * One frame on its own is a request for that frame: the artwork inside it,
 * cropped to its edge, without its own border and label. Anything else
 * selected is itself, frames with their contents. Nothing selected is the
 * whole of `shapes`.
 */
export function exportScopeFor(shapes: readonly Shape[], selected: readonly Shape[]): ExportScope {
  const [only] = selected;
  if (selected.length === 1 && only && isFrame(only)) {
    return { shapes: shapesForFrameExport(only, shapes), region: frameBounds(only) };
  }
  return { shapes: selected.length > 0 ? withFrameMembers(selected, shapes) : shapes };
}

function backgroundFor(settings: ImageExportSettings): string | null {
  return settings.withBackground ? settings.backgroundColor : null;
}

export interface RenderedExport {
  canvas: HTMLCanvasElement;
}

/**
 * Render the shapes to an off-screen canvas at export settings.
 *
 * The theme reaches the renderer rather than the finished bitmap: each shape
 * is painted in the colour that board gives it, which is how the screen does
 * it too. `backgroundColor` arrives already resolved for the theme being
 * exported.
 */
export function renderExportCanvas(
  shapes: readonly Shape[],
  settings: ImageExportSettings,
  images?: ImageSource,
): RenderedExport {
  const { width, height } = measureExportSize(shapes, {
    scale: settings.scale,
    region: settings.region,
  });
  if (width * height > MAX_EXPORT_PIXELS) throw new ExportTooLargeError();

  const canvas = document.createElement('canvas');
  renderSceneToCanvas(canvas, shapes, {
    scale: settings.scale,
    region: settings.region,
    backgroundColor: backgroundFor(settings),
    images,
    darkMode: settings.dark,
  });

  return { canvas };
}

/** PNG bytes for a rendered canvas. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      // A canvas the browser can't encode yields null rather than throwing.
      if (blob) resolve(blob);
      else reject(new ExportTooLargeError());
    }, 'image/png');
  });
}

/**
 * The SVG element for the same scene, themed the same way the PNG is.
 *
 * Bare, for the clipboard: what is pasted lands in a document or an editor,
 * where an XML declaration halfway down is noise or an error.
 */
export function svgMarkup(
  shapes: readonly Shape[],
  settings: ImageExportSettings,
  imageDataUrls?: ReadonlyMap<string, string>,
): string {
  return renderSceneToSvgString(shapes, {
    scale: settings.scale,
    region: settings.region,
    backgroundColor: backgroundFor(settings),
    imageDataUrls,
    darkMode: settings.dark,
  });
}

/** The same, as a file: declared as XML, so older software parses it. */
export function exportSvgString(
  shapes: readonly Shape[],
  settings: ImageExportSettings,
  imageDataUrls?: ReadonlyMap<string, string>,
): string {
  return SVG_DOCUMENT_PREAMBLE + svgMarkup(shapes, settings, imageDataUrls);
}

/**
 * Put the PNG on the system clipboard.
 *
 * Takes the PNG still being encoded, and must be called before anything is
 * awaited: Safari refuses a clipboard write that comes after one. See
 * `writeClipboardItem`.
 */
export function copyPngToClipboard(png: Promise<Blob>): Promise<void> {
  return writeClipboardItem('image/png', png);
}
