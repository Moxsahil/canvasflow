import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Drawable } from 'roughjs/bin/core';
import type { RectangleShape } from '../shapes';

/**
 * Create a Rough.js wrapper for a canvas context.
 * Each shape we render needs to be told to use Rough's "hand-drawn" style.
 */
export function createRoughCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): RoughCanvas {
  // rough.canvas accepts either an HTMLCanvasElement or anything with similar shape
  return rough.canvas(canvas as HTMLCanvasElement);
}

/**
 * Generate a Rough.js Drawable for a rectangle shape.
 * Returns the drawable so callers can render or cache it.
 */

export function generateRectangleDrawable(rc: RoughCanvas, shape: RectangleShape): Drawable {
  return rc.generator.rectangle(shape.x, shape.y, shape.width, shape.height, {
    seed: shape.seed,
    stroke: shape.strokeColor,
    strokeWidth: shape.strokeWidth,
    fill: shape.fillColor ?? undefined,
    fillStyle: shape.fillColor ? 'hachure' : undefined,
    roughness: 1,
  });
}

/** Render a pre-generated Drawable to a Rough canvas. */
export function drawShape(rc: RoughCanvas, drawable: Drawable) {
  rc.draw(drawable);
}
