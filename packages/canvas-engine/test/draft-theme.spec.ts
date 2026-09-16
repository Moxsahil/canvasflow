import { renderStaticScene } from '../src/renderers/static.js';
import { renderNewElementScene } from '../src/renderers/new-element.js';
import { DARK_INK_COLOR, DEFAULT_STROKE_COLOR } from '../src/shapes/style.js';
import { makeTestRectangle } from './fixtures/shapes.js';

const W = 200;
const H = 120;

function createTestCanvas() {
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  return { canvas, ctx };
}

/**
 * A rectangle drawn with the pen as it comes, which is the one colour that is
 * resolved per theme rather than kept as chosen.
 */
const defaultPenRectangle = () =>
  makeTestRectangle({
    x: 20,
    y: 20,
    width: 160,
    height: 80,
    strokeColor: DEFAULT_STROKE_COLOR,
    roughness: 0,
    strokeWidth: 4,
  });

/** Every pixel with any ink in it, as `r,g,b` strings. */
function inkColors(ctx: OffscreenCanvasRenderingContext2D): Set<string> {
  const { data } = ctx.getImageData(0, 0, W, H);
  const seen = new Set<string>();
  for (let i = 0; i < data.length; i += 4) {
    // Only fully opaque pixels, so antialiased edges blended against a
    // transparent canvas don't count as colours of their own.
    if (data[i + 3] === 255) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  }
  return seen;
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

describe('a shape does not change colour when it stops being a draft', () => {
  it('paints the default stroke as ink on a dark board, while it is still being drawn', () => {
    const { canvas, ctx } = createTestCanvas();
    renderNewElementScene(ctx, canvas, {
      width: W,
      height: H,
      newElement: defaultPenRectangle(),
      darkMode: true,
    });

    const colors = inkColors(ctx);
    expect(colors).toContain(hexToRgb(DARK_INK_COLOR));
    // The bug this replaces: the draft layer was never told which board it was
    // painting on, so it laid a near-black line on a near-black ground until
    // the shape was let go.
    expect(colors).not.toContain(hexToRgb(DEFAULT_STROKE_COLOR));
  });

  it('hands over to the document layer without a change of colour', () => {
    const shape = defaultPenRectangle();

    const draft = createTestCanvas();
    renderNewElementScene(draft.ctx, draft.canvas, {
      width: W,
      height: H,
      newElement: shape,
      darkMode: true,
    });

    const committed = createTestCanvas();
    renderStaticScene(committed.ctx, committed.canvas, {
      width: W,
      height: H,
      shapes: [shape],
      darkMode: true,
    });

    expect([...inkColors(draft.ctx)].sort()).toEqual([...inkColors(committed.ctx)].sort());
  });

  it('still paints the default stroke as chosen on a light board', () => {
    const { canvas, ctx } = createTestCanvas();
    renderNewElementScene(ctx, canvas, {
      width: W,
      height: H,
      newElement: defaultPenRectangle(),
      darkMode: false,
    });

    expect(inkColors(ctx)).toContain(hexToRgb(DEFAULT_STROKE_COLOR));
  });

  it('leaves a chosen colour alone in either theme', () => {
    const red = makeTestRectangle({
      x: 20,
      y: 20,
      width: 160,
      height: 80,
      strokeColor: '#e03131',
      roughness: 0,
      strokeWidth: 4,
    });

    for (const darkMode of [true, false]) {
      const { canvas, ctx } = createTestCanvas();
      renderNewElementScene(ctx, canvas, { width: W, height: H, newElement: red, darkMode });
      expect(inkColors(ctx)).toContain(hexToRgb('#e03131'));
    }
  });
});
