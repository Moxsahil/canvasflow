export * from './math.js';
export * from './shapes/index.js';
export * from './renderers/index.js';
export { setupCanvas, clearCanvas } from './utils/canvas.js';

/**
 * @canvasflow/canvas-engine — public API.
 */

export * from './spatial/index.js';
export { simplifyPoints, isPathALoop } from './utils/simplify.js';
export * from './geometry/segment.js';
export * from './hit-testing/index.js';
export * from './document/index.js';
