import {
  applyDarkFilter,
  measureExportSize,
  renderSceneToCanvas,
  renderSceneToSvgString,
  SVG_DOCUMENT_PREAMBLE,
  type Shape,
} from '@canvasflow/canvas-engine';

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
}

export class ExportTooLargeError extends Error {
  constructor() {
    super('That export is too large. Try a smaller scale.');
    this.name = 'ExportTooLargeError';
  }
}

function backgroundFor(settings: ImageExportSettings): string | null {
  return settings.withBackground ? settings.backgroundColor : null;
}

export interface RenderedExport {
  canvas: HTMLCanvasElement;
  /** False when dark was asked for but `ctx.filter` isn't supported. */
  darkApplied: boolean;
}

/**
 * Render the shapes to an off-screen canvas at export settings.
 *
 * Dark mode is a filtered copy of the finished image rather than a per-shape
 * colour change, because that is exactly what the editor does on screen — the
 * file then matches the board instead of merely resembling it.
 */
export function renderExportCanvas(
  shapes: readonly Shape[],
  settings: ImageExportSettings,
): RenderedExport {
  const { width, height } = measureExportSize(shapes, { scale: settings.scale });
  if (width * height > MAX_EXPORT_PIXELS) throw new ExportTooLargeError();

  const canvas = document.createElement('canvas');
  renderSceneToCanvas(canvas, shapes, {
    scale: settings.scale,
    backgroundColor: backgroundFor(settings),
  });

  if (!settings.dark) return { canvas, darkApplied: false };

  const filtered = document.createElement('canvas');
  const darkApplied = applyDarkFilter(canvas, filtered);
  return { canvas: darkApplied ? filtered : canvas, darkApplied };
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
 * SVG for the same scene.
 *
 * Dark mode is expressed as a filter on the root group: an SVG has no pixels
 * to post-process, and this is the same transform applied to the same
 * composed image, so it matches the PNG and the screen.
 */
export function exportSvgString(shapes: readonly Shape[], settings: ImageExportSettings): string {
  const svg = renderSceneToSvgString(shapes, {
    scale: settings.scale,
    backgroundColor: backgroundFor(settings),
  });
  const themed = settings.dark
    ? svg.replace('<svg ', '<svg style="filter: invert(93%) hue-rotate(180deg)" ')
    : svg;
  return SVG_DOCUMENT_PREAMBLE + themed;
}

/**
 * Put the PNG on the system clipboard.
 *
 * Firefox has no ClipboardItem by default, which surfaces as a TypeError — the
 * one failure worth naming, since the user can enable it.
 */
export async function copyPngToClipboard(blob: Blob): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error(
      "This browser can't copy images to the clipboard. Firefox needs dom.events.asyncClipboard.clipboardItem enabled.",
    );
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
