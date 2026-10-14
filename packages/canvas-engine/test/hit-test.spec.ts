import { describe, expect, it } from 'vitest';
import { COARSE_HIT_MARGIN, HIT_MARGIN, hitTest } from '../src/hit-testing/hit-test.js';
import {
  createArrow,
  createEllipse,
  createFreehand,
  createLine,
  createRectangle,
  createText,
} from '../src/shapes/index.js';
import type { Shape } from '../src/shapes/shape.js';
import { SpatialIndex } from '../src/spatial/spatial-index.js';

function at(
  shapes: Shape[],
  x: number,
  y: number,
  options: Parameters<typeof hitTest>[5] = {},
  zoom = 1,
): string | null {
  const index = new SpatialIndex();
  index.rebuild(shapes);
  return hitTest(shapes, index, x, y, zoom, options)?.id ?? null;
}

/** From (0, 0) to (400, 400): its box covers far more board than the line does. */
const diagonal = createLine({
  id: 'diagonal',
  x: 0,
  y: 0,
  points: [
    [0, 0],
    [400, 400],
  ],
});

/** Dead flat, so its box has no height at all. */
const flat = createLine({
  id: 'flat',
  x: 0,
  y: 100,
  points: [
    [0, 0],
    [300, 0],
  ],
});

describe('hitTest — on the line, not in its box', () => {
  it('takes a press on a diagonal line, give or take the margin', () => {
    expect(at([diagonal], 200, 200)).toBe('diagonal');
    expect(at([diagonal], 200 + HIT_MARGIN / 2, 200)).toBe('diagonal');
  });

  it('leaves empty board in the corners of a diagonal line’s box', () => {
    expect(at([diagonal], 50, 350)).toBeNull();
    expect(at([diagonal], 350, 50)).toBeNull();
  });

  it('takes a press just off a dead-flat line, which has no box to land in', () => {
    expect(at([flat], 150, 100)).toBe('flat');
    expect(at([flat], 150, 103)).toBe('flat');
    expect(at([flat], 150, 97)).toBe('flat');
    expect(at([flat], 150, 100 + HIT_MARGIN + 2)).toBeNull();
  });

  it('gives a finger or a pencil a wider margin than a mouse', () => {
    const off = 100 + HIT_MARGIN + 2;
    expect(at([flat], 150, off)).toBeNull();
    expect(at([flat], 150, off, { margin: COARSE_HIT_MARGIN })).toBe('flat');
  });

  it('holds the margin to the same size on screen however far the board is zoomed', () => {
    // At 4x, eight screen pixels are two on the board.
    expect(at([flat], 150, 101.5, {}, 4)).toBe('flat');
    expect(at([flat], 150, 103, {}, 4)).toBeNull();
  });

  it('takes the empty middle of a freehand curve as empty board', () => {
    const cup = createFreehand({
      id: 'cup',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [0, 100],
        [100, 100],
        [100, 0],
      ],
    });
    expect(at([cup], 50, 50)).toBeNull();
    expect(at([cup], 50, 100)).toBe('cup');
  });

  it('follows a curved arrow along the curve it is drawn on', () => {
    const curved = createArrow({
      id: 'curved',
      x: 0,
      y: 0,
      arrowType: 'curved',
      points: [
        [0, 0],
        [100, 100],
        [200, 0],
      ],
    });
    // On the bow of the curve, which the straight segments cut inside of.
    expect(at([curved], 50, 62)).toBe('curved');
    expect(at([curved], 100, 30)).toBeNull();
  });
});

describe('hitTest — closed shapes', () => {
  const ellipse = createEllipse({ id: 'ellipse', x: 0, y: 0, width: 200, height: 100 });

  it('leaves the corners of an ellipse’s box, outside its curve', () => {
    expect(at([ellipse], 5, 5)).toBeNull();
    expect(at([ellipse], 100, 2)).toBe('ellipse');
  });

  it('takes the empty middle of an unfilled shape, as before', () => {
    expect(at([ellipse], 100, 50)).toBe('ellipse');
  });

  it('gives a press to the line under the empty middle of a shape over it', () => {
    const box = createRectangle({ id: 'box', x: 0, y: 0, width: 400, height: 400 });
    expect(at([diagonal, box], 200, 200)).toBe('diagonal');
    expect(at([diagonal, box], 100, 300)).toBe('box');
  });

  it('keeps a filled shape solid, over whatever is under it', () => {
    const filled = createRectangle({
      id: 'filled',
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      fillColor: '#ffcc00',
    });
    expect(at([diagonal, filled], 200, 200)).toBe('filled');
  });

  it('gives a press inside two empty shapes to the smaller one', () => {
    const outer = createRectangle({ id: 'outer', x: 0, y: 0, width: 400, height: 400 });
    const inner = createRectangle({ id: 'inner', x: 100, y: 100, width: 100, height: 100 });
    expect(at([inner, outer], 150, 150)).toBe('inner');
  });

  it('takes a text by its box, with the margin around it', () => {
    const text = createText({ id: 'text', x: 0, y: 0, text: 'Hello' });
    expect(at([text], 1, 1)).toBe('text');
    expect(at([text], -HIT_MARGIN / 2, 1)).toBe('text');
  });
});

describe('hitTest — a shape a line runs past', () => {
  it('lets a small shape be pressed under the box of an arrow passing it', () => {
    const small = createRectangle({ id: 'small', x: 20, y: 300, width: 60, height: 60 });
    const arrow = createArrow({
      id: 'arrow',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [400, 400],
      ],
    });
    expect(at([small, arrow], 50, 330)).toBe('small');
  });
});

describe('hitTest — the selection', () => {
  it('picks up a selected line anywhere inside the box around it', () => {
    expect(at([diagonal], 50, 350)).toBeNull();
    expect(at([diagonal], 50, 350, { selectedIds: ['diagonal'] })).toBe('diagonal');
  });

  it('still gives a press to a shape on top of the selection first', () => {
    const over = createRectangle({
      id: 'over',
      x: 30,
      y: 330,
      width: 40,
      height: 40,
      fillColor: '#ffcc00',
    });
    expect(at([diagonal, over], 50, 350, { selectedIds: ['diagonal'] })).toBe('over');
  });

  it('leaves empty board outside the selection’s box', () => {
    expect(at([diagonal], 500, 500, { selectedIds: ['diagonal'] })).toBeNull();
  });
});
