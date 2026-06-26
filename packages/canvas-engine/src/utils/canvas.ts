/**
 * Handles devicePixelRatio so canvas rendering stays crisp on retina
 * displays without blurriness or coordinate skew.
 */

export interface CanvasSetupOptions {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio?: number;
}

export function setupCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: CanvasSetupOptions,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const dpr = opts.devicePixelRatio ?? 1;
  const { width, height } = opts;

  // pixel buffer size( the actual bitmap)
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  // CSS size (the visible size) — only applies to HTMLCanvasElement
  if ('style' in canvas) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
  }
  // Scale so drawing commands use CSS pixels
  ctx.scale(dpr, dpr);

  return ctx;
}

export function clearCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
}
