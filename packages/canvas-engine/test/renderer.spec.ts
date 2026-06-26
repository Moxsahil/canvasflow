import { describe, it, expect } from 'vitest';
import { createCanvas } from 'canvas';
import { renderStaticScene } from '../src/renderers/static.js';
import { renderInteractiveScene } from '../src/renderers/interactive.js';
import { renderNewElementScene } from '../src/renderers/new-element.js';
import { makeTestRectangle, makeTestRectangles } from './fixtures/shapes.js';

/**
 * Helper: create a node-canvas instance for testing.
 * The `canvas` package provides a Canvas2D-compatible API in Node.
 */
function createTestCanvas(width: number, height: number) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  // node-canvas's ctx is compatible with CanvasRenderingContext2D
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    ctx: ctx as unknown as CanvasRenderingContext2D,
  };
}

describe('renderStaticScene', () => {
  it('clears the canvas when there are no shapes', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);

    renderStaticScene(ctx, canvas, {
      width: 200,
      height: 100,
      shapes: [],
    });

    // Get pixel data — should be fully transparent
    const imageData = ctx.getImageData(0, 0, 200, 100);
    const allTransparent = Array.from(imageData.data).every((channel, i) => {
      // alpha channel (every 4th byte) should be 0 for transparent
      return i % 4 !== 3 || channel === 0;
    });
    expect(allTransparent).toBe(true);
  });

  it('paints something to the canvas when given a rectangle', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);
    const rect = makeTestRectangle();

    renderStaticScene(ctx, canvas, {
      width: 200,
      height: 100,
      shapes: [rect],
    });

    // After rendering, at least some pixels should have non-zero alpha
    const imageData = ctx.getImageData(0, 0, 200, 100);
    const hasOpaquePixels = Array.from(imageData.data).some((channel, i) => {
      return i % 4 === 3 && channel > 0;
    });
    expect(hasOpaquePixels).toBe(true);
  });

  it('handles multiple shapes without errors', () => {
    const { canvas, ctx } = createTestCanvas(800, 200);
    const rects = makeTestRectangles(5);

    expect(() => {
      renderStaticScene(ctx, canvas, {
        width: 800,
        height: 200,
        shapes: rects,
      });
    }).not.toThrow();
  });

  it('applies camera transform when provided', () => {
    const { canvas, ctx } = createTestCanvas(400, 200);
    const rect = makeTestRectangle({ x: 10, y: 10, width: 100, height: 50 });

    expect(() => {
      renderStaticScene(ctx, canvas, {
        width: 400,
        height: 200,
        shapes: [rect],
        camera: { x: 50, y: 25, zoom: 2 },
      });
    }).not.toThrow();
  });
});

describe('renderInteractiveScene', () => {
  it('clears the canvas when nothing is selected', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);
    const rect = makeTestRectangle();

    renderInteractiveScene(ctx, canvas, {
      width: 200,
      height: 100,
      shapes: [rect],
      selectedIds: [],
    });

    const imageData = ctx.getImageData(0, 0, 200, 100);
    const allTransparent = Array.from(imageData.data).every(
      (channel, i) => i % 4 !== 3 || channel === 0,
    );
    expect(allTransparent).toBe(true);
  });

  it('paints a selection box around selected shapes', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);
    const rect = makeTestRectangle();

    renderInteractiveScene(ctx, canvas, {
      width: 200,
      height: 100,
      shapes: [rect],
      selectedIds: [rect.id],
    });

    // Some pixels should be painted for the selection outline
    const imageData = ctx.getImageData(0, 0, 200, 100);
    const hasPaintedPixels = Array.from(imageData.data).some(
      (channel, i) => i % 4 === 3 && channel > 0,
    );
    expect(hasPaintedPixels).toBe(true);
  });
});

describe('renderNewElementScene', () => {
  it('clears the canvas when no element is being drawn', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);

    renderNewElementScene(ctx, canvas, {
      width: 200,
      height: 100,
      newElement: null,
    });

    const imageData = ctx.getImageData(0, 0, 200, 100);
    const allTransparent = Array.from(imageData.data).every(
      (channel, i) => i % 4 !== 3 || channel === 0,
    );
    expect(allTransparent).toBe(true);
  });

  it('paints the in-progress shape', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);
    const rect = makeTestRectangle();

    renderNewElementScene(ctx, canvas, {
      width: 200,
      height: 100,
      newElement: rect,
    });

    const imageData = ctx.getImageData(0, 0, 200, 100);
    const hasPaintedPixels = Array.from(imageData.data).some(
      (channel, i) => i % 4 === 3 && channel > 0,
    );
    expect(hasPaintedPixels).toBe(true);
  });
});
