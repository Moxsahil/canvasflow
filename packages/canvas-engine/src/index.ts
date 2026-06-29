export * from './math.js';
export * from './shapes/index.js';
export * from './renderers/index.js';
export { setupCanvas, clearCanvas } from './utils/canvas.js';

/**
 * @canvasflow/canvas-engine — public API.
 *
 * Three renderers compose to draw a CanvasFlow scene:
 *
 *   - renderStaticScene: the "background" — all finished shapes
 *   - renderInteractiveScene: the "overlay" — selection, cursors
 *   - renderNewElementScene: the shape being actively drawn
 *
 * Mount each onto its own HTMLCanvasElement stacked in the DOM, with
 * the interactive canvas on top.
 */
