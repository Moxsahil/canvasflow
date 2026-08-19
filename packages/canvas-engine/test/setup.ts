import { createCanvas } from 'canvas';

/**
 * Polyfill OffscreenCanvas for the Node test environment using the cairo-backed
 * `canvas` package, so rendering tests produce real pixel output.
 *
 * `width`/`height` are accessors that rebuild the backing bitmap, because that
 * is what a real canvas does: production code sizes canvases by assigning to
 * them (see setupCanvas and the export renderer), and a fixed-size stand-in
 * silently drops every draw outside the initial 1×1 bitmap — tests pass while
 * asserting on pixels that were never rendered.
 */
class OffscreenCanvasPolyfill {
  private _canvas: ReturnType<typeof createCanvas>;
  private _width: number;
  private _height: number;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this._canvas = createCanvas(width, height);
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = value;
    // Resizing clears the canvas in browsers too, so rebuilding matches.
    this._canvas = createCanvas(value, this._height);
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = value;
    this._canvas = createCanvas(this._width, value);
  }

  getContext(contextType: string) {
    return this._canvas.getContext(contextType as '2d');
  }
}

(globalThis as unknown as { OffscreenCanvas: typeof OffscreenCanvasPolyfill }).OffscreenCanvas =
  OffscreenCanvasPolyfill;
