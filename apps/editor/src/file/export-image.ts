import {
  applyDarkFilter,
  DARK_EXPORT_FILTER,
  measureExportSize,
  renderSceneToCanvas,
  renderSceneToSvgString,
  SVG_DOCUMENT_PREAMBLE,
  type ImageSource,
  type Rect,
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
 * Dark mode filters the drawing but not the background, because that is what
 * the editor does on screen: the board's colour is chosen per theme and painted
 * outside the inversion, so filtering it here would export a colour the board
 * never shows. `backgroundColor` therefore arrives already resolved for the
 * theme being exported.
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

  const background = backgroundFor(settings);

  const canvas = document.createElement('canvas');
  renderSceneToCanvas(canvas, shapes, {
    scale: settings.scale,
    region: settings.region,
    // Held back in dark mode so the filter below lands on the drawing alone.
    backgroundColor: settings.dark ? null : background,
    images,
    // The dark filter is applied to the finished bitmap below, so photographs
    // have to be painted pre-compensated for it here — exactly as they are on
    // screen, where the same filter sits over the live canvas.
    darkMode: settings.dark,
  });

  if (!settings.dark) return { canvas, darkApplied: false };

  const filtered = document.createElement('canvas');
  const darkApplied = applyDarkFilter(canvas, filtered);
  if (!darkApplied) return { canvas, darkApplied };
  if (!background) return { canvas: filtered, darkApplied };

  const composed = document.createElement('canvas');
  composed.width = filtered.width;
  composed.height = filtered.height;
  const ctx = composed.getContext('2d');
  // No 2D context means no compositing; the filtered drawing on its own
  // transparent background is still a correct export, just without the tint.
  if (!ctx) return { canvas: filtered, darkApplied };

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, composed.width, composed.height);
  ctx.drawImage(filtered, 0, 0);
  return { canvas: composed, darkApplied };
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
 * The filter goes on the shape group rather than the root, so it matches the
 * PNG and the screen: the background rect is a sibling of that group and stays
 * the colour chosen for this theme instead of being inverted into another one.
 */
export function exportSvgString(
  shapes: readonly Shape[],
  settings: ImageExportSettings,
  imageDataUrls?: ReadonlyMap<string, string>,
): string {
  const svg = renderSceneToSvgString(shapes, {
    scale: settings.scale,
    region: settings.region,
    backgroundColor: backgroundFor(settings),
    imageDataUrls,
  });
  const themed = settings.dark
    ? svg.replace('<g transform=', `<g style="filter: ${DARK_EXPORT_FILTER}" transform=`)
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
