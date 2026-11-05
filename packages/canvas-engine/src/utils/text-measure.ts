/**
 * Shared text measurement.
 *
 * One offscreen context for the whole package: acquiring one is not free, and
 * the alternative is every caller that needs a glyph width keeping a canvas of
 * its own alive for the life of the process.
 */

let measureCtx: OffscreenCanvasRenderingContext2D | null = null;

function getMeasureContext(): OffscreenCanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not acquire a 2D context for text measurement');
    }
    measureCtx = ctx;
  }
  return measureCtx;
}

const layoutCaches = new Set<() => void>();

/**
 * Registers a cache of answers worked out by measuring text, to be dropped by
 * `forgetTextLayouts`.
 */
export function registerTextLayoutCache(clear: () => void): void {
  layoutCaches.add(clear);
}

/**
 * Drops every answer worked out by measuring text. For when a font finishes
 * loading: everything measured before it arrived was measured in whatever
 * stood in for it, and would keep its lines broken in the wrong places.
 */
export function forgetTextLayouts(): void {
  for (const clear of layoutCaches) clear();
}

/** Width of one line, in the units the font string is expressed in. */
export function measureTextWidth(text: string, font: string): number {
  const ctx = getMeasureContext();
  ctx.font = font;
  return ctx.measureText(text).width;
}
