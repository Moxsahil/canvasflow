import { createCanvas } from 'canvas';

// Polyfill OffscreenCanvas for Node.js test environment using the cairo-backed
// canvas package, so rendering tests produce real pixel output.
class OffscreenCanvasPolyfill {
  private _canvas: ReturnType<typeof createCanvas>;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this._canvas = createCanvas(width, height);
  }

  getContext(contextType: string) {
    return this._canvas.getContext(contextType as '2d');
  }
}

(globalThis as unknown as { OffscreenCanvas: typeof OffscreenCanvasPolyfill }).OffscreenCanvas =
  OffscreenCanvasPolyfill;
