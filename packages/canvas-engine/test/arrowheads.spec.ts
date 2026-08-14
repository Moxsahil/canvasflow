import { renderStaticScene } from '../src/renderers/static.js';
import { ARROWHEAD_GEOMETRY, type Arrowhead } from '../src/shapes/style.js';
import { makeTestArrow, makeTestLine, makeTestFreehand } from './fixtures/shapes.js';

function createTestCanvas(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  return { canvas, ctx };
}

const ALL_ARROWHEADS = ['none', ...Object.keys(ARROWHEAD_GEOMETRY)] as Arrowhead[];

describe('arrowheads', () => {
  it.each(ALL_ARROWHEADS)('renders %s at both ends without throwing', (arrowhead) => {
    const { canvas, ctx } = createTestCanvas(300, 200);
    const shape = makeTestArrow({ startArrowhead: arrowhead, endArrowhead: arrowhead });

    expect(() =>
      renderStaticScene(ctx, canvas, { width: 300, height: 200, shapes: [shape] }),
    ).not.toThrow();
  });

  it('survives a zero-length arrow', () => {
    const { canvas, ctx } = createTestCanvas(100, 100);
    const shape = makeTestArrow({
      points: [
        [0, 0],
        [0, 0],
      ],
      endArrowhead: 'triangle',
    });

    expect(() =>
      renderStaticScene(ctx, canvas, { width: 100, height: 100, shapes: [shape] }),
    ).not.toThrow();
  });

  it.each(['straight', 'curved', 'elbow'] as const)('renders a %s arrow', (arrowType) => {
    const { canvas, ctx } = createTestCanvas(300, 200);
    const shape = makeTestArrow({ arrowType, endArrowhead: 'arrow' });

    expect(() =>
      renderStaticScene(ctx, canvas, { width: 300, height: 200, shapes: [shape] }),
    ).not.toThrow();
  });
});

describe('fillable lines and freehand', () => {
  it('renders a filled line as a closed polygon', () => {
    const { canvas, ctx } = createTestCanvas(300, 200);
    const shape = makeTestLine({ fillColor: '#a5d8ff', fillStyle: 'solid' });

    expect(() =>
      renderStaticScene(ctx, canvas, { width: 300, height: 200, shapes: [shape] }),
    ).not.toThrow();
  });

  it('renders a looped freehand stroke with a fill', () => {
    const { canvas, ctx } = createTestCanvas(300, 200);
    const shape = makeTestFreehand({
      fillColor: '#b2f2bb',
      points: [
        [0, 0],
        [40, 2],
        [42, 40],
        [2, 38],
        [1, 3],
      ],
    });

    expect(() =>
      renderStaticScene(ctx, canvas, { width: 300, height: 200, shapes: [shape] }),
    ).not.toThrow();
  });

  it('renders an open freehand stroke with a fill colour set', () => {
    const { canvas, ctx } = createTestCanvas(300, 200);
    // Not a loop, so no fill layer is produced — must still render the stroke.
    const shape = makeTestFreehand({
      fillColor: '#b2f2bb',
      points: [
        [0, 0],
        [40, 10],
        [90, 60],
      ],
    });

    expect(() =>
      renderStaticScene(ctx, canvas, { width: 300, height: 200, shapes: [shape] }),
    ).not.toThrow();
  });
});
