import { describe, expect, it, vi } from 'vitest';
import { renderInteractiveScene } from '../src/renderers/interactive.js';
import { createArrow } from '../src/shapes/arrow.js';
import { createLine } from '../src/shapes/line.js';
import { createRectangle } from '../src/shapes/rectangle.js';
import type { Shape } from '../src/shapes/shape.js';

function watchedCanvas() {
  const canvas = new OffscreenCanvas(400, 400);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  return {
    canvas,
    ctx,
    strokeRect: vi.spyOn(ctx, 'strokeRect'),
    fillRect: vi.spyOn(ctx, 'fillRect'),
    arc: vi.spyOn(ctx, 'arc'),
    bezierCurveTo: vi.spyOn(ctx, 'bezierCurveTo'),
  };
}

function draw(shape: Shape, hoveredHandleId: string | null = null) {
  const watched = watchedCanvas();
  renderInteractiveScene(watched.ctx, watched.canvas, {
    width: 400,
    height: 400,
    shapes: [shape],
    selectedIds: [shape.id],
    marquee: null,
    hoveredHandleId,
  });
  return watched;
}

const line = createLine({
  id: 'line',
  x: 20,
  y: 20,
  points: [
    [0, 0],
    [200, 100],
  ],
});

const straightArrow = createArrow({
  id: 'arrow',
  x: 20,
  y: 20,
  points: [
    [0, 0],
    [200, 0],
  ],
});

const box = createRectangle({ id: 'box', x: 20, y: 20, width: 100, height: 60 });

describe('renderInteractiveScene — what a selection is outlined with', () => {
  it('boxes a shape that fills a box, and gives it square handles', () => {
    const { strokeRect, fillRect, arc } = draw(box);
    expect(strokeRect).toHaveBeenCalled();
    expect(fillRect).toHaveBeenCalled();
    expect(arc).not.toHaveBeenCalled();
  });

  it('outlines a line along itself instead of boxing it', () => {
    const { strokeRect, bezierCurveTo } = draw(line);
    expect(strokeRect).not.toHaveBeenCalled();
    expect(bezierCurveTo).toHaveBeenCalled();
  });

  it('outlines an arrow along itself instead of boxing it', () => {
    const { strokeRect, bezierCurveTo } = draw(straightArrow);
    expect(strokeRect).not.toHaveBeenCalled();
    expect(bezierCurveTo).toHaveBeenCalled();
  });

  it('marks a line by its points, with round handles rather than square ones', () => {
    const { fillRect, arc } = draw(line);
    expect(fillRect).not.toHaveBeenCalled();
    expect(arc).toHaveBeenCalledTimes(2);
  });

  it('keeps the handle that would add a point out of the way until it is hovered', () => {
    expect(draw(line).arc).toHaveBeenCalledTimes(2);
    // The circle, plus the disc marking the pointer has found it.
    expect(draw(line, 'm0').arc).toHaveBeenCalledTimes(4);
  });
});
