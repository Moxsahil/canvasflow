import { renderStaticScene } from '../src/renderers/static.js';
import {
  makeTestEllipse,
  makeTestDiamond,
  makeTestLine,
  makeTestArrow,
  makeTestFreehand,
  makeTestText,
  makeAllTestShapes,
} from './fixtures/shapes.js';

function createTestCanvas(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  return { canvas, ctx };
}

describe('renderStaticScene — additional shape kinds', () => {
  it('renders an ellipse without errors', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);
    expect(() => {
      renderStaticScene(ctx, canvas, {
        width: 200,
        height: 100,
        shapes: [makeTestEllipse()],
      });
    }).not.toThrow();
  });

  it('renders a diamond without errors', () => {
    const { canvas, ctx } = createTestCanvas(200, 150);
    expect(() => {
      renderStaticScene(ctx, canvas, {
        width: 200,
        height: 150,
        shapes: [makeTestDiamond()],
      });
    }).not.toThrow();
  });

  it('renders a line without errors', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);
    expect(() => {
      renderStaticScene(ctx, canvas, {
        width: 200,
        height: 100,
        shapes: [makeTestLine()],
      });
    }).not.toThrow();
  });

  it('renders an arrow with arrowhead without errors', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);
    expect(() => {
      renderStaticScene(ctx, canvas, {
        width: 200,
        height: 100,
        shapes: [makeTestArrow()],
      });
    }).not.toThrow();
  });

  it('renders freehand without errors', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);
    expect(() => {
      renderStaticScene(ctx, canvas, {
        width: 200,
        height: 100,
        shapes: [makeTestFreehand()],
      });
    }).not.toThrow();
  });

  it('renders text without errors', () => {
    const { canvas, ctx } = createTestCanvas(200, 100);
    expect(() => {
      renderStaticScene(ctx, canvas, {
        width: 200,
        height: 100,
        shapes: [makeTestText()],
      });
    }).not.toThrow();
  });

  it('renders all 7 shape kinds in one scene', () => {
    const { canvas, ctx } = createTestCanvas(900, 200);
    expect(() => {
      renderStaticScene(ctx, canvas, {
        width: 900,
        height: 200,
        shapes: makeAllTestShapes(),
      });
    }).not.toThrow();

    // At least some pixels should be painted
    const imageData = ctx.getImageData(0, 0, 900, 200);
    const hasPaintedPixels = Array.from(imageData.data).some(
      (channel, i) => i % 4 === 3 && channel > 0,
    );
    expect(hasPaintedPixels).toBe(true);
  });
});
