import { describe, expect, it } from 'vitest';
import { renderStaticScene } from '../src/renderers/static';
import { createArrow } from '../src/shapes/arrow';
import { createDiamond } from '../src/shapes/diamond';
import { createEllipse } from '../src/shapes/ellipse';
import { createFreehand } from '../src/shapes/freehand';
import { createLine } from '../src/shapes/line';
import { createRectangle } from '../src/shapes/rectangle';
import { createText } from '../src/shapes/text';
import type { Shape } from '../src/shapes/shape';

/**
 * The claim dynamic size makes, checked in pixels.
 *
 * Drawing at 25% with the preference on stores a shape four times the size
 * with `scale: 4`. Seen back through a quarter-scale camera that has to come
 * out as the very same picture it would have been at 1:1 — that equivalence
 * is the entire feature, and it is the thing to break if a new reader of
 * `strokeWidth` or `fontSize` ever forgets to go through `strokeWidthOf` /
 * `fontSizeOf`.
 *
 * So each case below builds the same drawing twice: once plainly, once
 * "drawn zoomed out", and renders both through the real scene renderer.
 */

const CANVAS = 240;
/** Where the drawing sits on screen, the same for both renders. */
const ORIGIN = 20;

/**
 * How much a channel has to move before the pixel counts as different.
 *
 * Counting every non-zero delta would measure the wrong thing. A bigger
 * ellipse is approximated with more curve segments than a small one, so the
 * two renders disagree on a rim of edge pixels by a shade or two — 0.76% of
 * subpixels, none of them off by more than 15/255. That is the same picture,
 * drawn a hair smoother. A quarter of full range ignores it while still
 * catching a stroke in the wrong place or the wrong weight, which moves
 * pixels between ink and paper.
 */
const SIGNIFICANT = 64;

/**
 * How much of the picture may differ and still count as the same drawing.
 *
 * Measured, not guessed: at `SIGNIFICANT` nothing at all separates a correct
 * pair except an arrow's head, which reaches 0.12% through a different chain
 * of floating-point transforms. Dropping the scale — the bug this file exists
 * to catch — costs between 0.53% and 1.24%. The bar sits in that gap with
 * room either side, and the last block keeps the gap honest.
 */
const TOLERANCE = 0.003;

function pixelsOf(shapes: readonly Shape[], zoom: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(CANVAS, CANVAS);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  renderStaticScene(ctx, canvas, {
    width: CANVAS,
    height: CANVAS,
    shapes,
    camera: { x: 0, y: 0, zoom },
    backgroundColor: '#ffffff',
  });
  return ctx.getImageData(0, 0, CANVAS, CANVAS).data;
}

/** What fraction of the picture actually changed, and by how much at worst. */
function compare(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let differing = 0;
  let worst = 0;
  const pixels = a.length / 4;

  for (let i = 0; i < a.length; i += 4) {
    let moved = false;
    // Alpha is skipped: both renders paint an opaque background.
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(a[i + channel]! - b[i + channel]!);
      if (delta > worst) worst = delta;
      if (delta > SIGNIFICANT) moved = true;
    }
    if (moved) differing++;
  }

  return { differing, worst, fraction: differing / pixels };
}

/** Guards against two blank canvases trivially agreeing. */
function inkOf(pixels: Uint8ClampedArray): number {
  let ink = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255) ink++;
  }
  return ink;
}

/**
 * One drawing, expressed two ways.
 *
 * `plain` is what the board holds when it was drawn at 1:1. `zoomedOut` is
 * what it holds when the same gesture was made at `1 / factor` zoom: every
 * length multiplied, and `scale` carrying the stroke and text weight.
 */
interface Case {
  readonly name: string;
  readonly plain: (o: number) => Shape;
  readonly zoomedOut: (o: number, factor: number) => Shape;
}

const common = { seed: 12345, roughness: 0, strokeWidth: 2 } as const;

/** The reference rectangle, at whatever multiple of its 1:1 size. */
const box = (f: number) => ({
  x: ORIGIN * f,
  y: ORIGIN * f,
  width: 120 * f,
  height: 60 * f,
});

const CASES: Case[] = [
  {
    name: 'a rectangle',
    plain: (o) => createRectangle({ ...common, id: 's', x: o, y: o, width: 120, height: 60 }),
    zoomedOut: (o, f) =>
      createRectangle({
        ...common,
        id: 's',
        x: o,
        y: o,
        width: 120 * f,
        height: 60 * f,
        scale: f,
      }),
  },
  {
    name: 'an ellipse',
    plain: (o) => createEllipse({ ...common, id: 's', x: o, y: o, width: 120, height: 60 }),
    zoomedOut: (o, f) =>
      createEllipse({ ...common, id: 's', x: o, y: o, width: 120 * f, height: 60 * f, scale: f }),
  },
  {
    name: 'a diamond',
    plain: (o) => createDiamond({ ...common, id: 's', x: o, y: o, width: 120, height: 60 }),
    zoomedOut: (o, f) =>
      createDiamond({ ...common, id: 's', x: o, y: o, width: 120 * f, height: 60 * f, scale: f }),
  },
  {
    name: 'a line',
    plain: (o) =>
      createLine({
        ...common,
        id: 's',
        x: o,
        y: o,
        points: [
          [0, 0],
          [60, 80],
          [140, 20],
        ],
      }),
    zoomedOut: (o, f) =>
      createLine({
        ...common,
        id: 's',
        x: o,
        y: o,
        points: [
          [0, 0],
          [60 * f, 80 * f],
          [140 * f, 20 * f],
        ],
        scale: f,
      }),
  },
  {
    // The arrowhead is a constant in board units, so this is the case that
    // fails if it is not given the shape's scale along with the shaft.
    name: 'an arrow, head and all',
    plain: (o) =>
      createArrow({
        ...common,
        id: 's',
        x: o,
        y: o,
        points: [
          [0, 0],
          [160, 90],
        ],
        endArrowhead: 'triangle',
        startArrowhead: 'circle',
      }),
    zoomedOut: (o, f) =>
      createArrow({
        ...common,
        id: 's',
        x: o,
        y: o,
        points: [
          [0, 0],
          [160 * f, 90 * f],
        ],
        endArrowhead: 'triangle',
        startArrowhead: 'circle',
        scale: f,
      }),
  },
  {
    name: 'a freehand stroke with pressure',
    plain: (o) =>
      createFreehand({
        ...common,
        id: 's',
        x: o,
        y: o,
        points: [
          [0, 0],
          [30, 40],
          [70, 10],
          [110, 60],
          [150, 20],
        ],
        simulatePressure: true,
      }),
    zoomedOut: (o, f) =>
      createFreehand({
        ...common,
        id: 's',
        x: o,
        y: o,
        points: (
          [
            [0, 0],
            [30, 40],
            [70, 10],
            [110, 60],
            [150, 20],
          ] as Array<[number, number]>
        ).map(([x, y]) => [x * f, y * f] as [number, number]),
        simulatePressure: true,
        scale: f,
      }),
  },
  {
    name: 'text',
    plain: (o) => createText({ ...common, id: 's', x: o, y: o, text: 'Hg\nyq', fontSize: 20 }),
    zoomedOut: (o, f) =>
      createText({ ...common, id: 's', x: o, y: o, text: 'Hg\nyq', fontSize: 20, scale: f }),
  },
];

describe.each([2, 4])('drawn at 1/%i zoom, dynamic size on', (factor) => {
  describe.each(CASES)('$name', ({ plain, zoomedOut }) => {
    it('renders the same picture it would have at 1:1', () => {
      const at1to1 = pixelsOf([plain(ORIGIN)], 1);
      // The world coordinates grow with the drawing, so the camera has to be
      // told where to look — at 1/factor zoom, ORIGIN * factor lands on ORIGIN.
      const drawnZoomedOut = pixelsOf([zoomedOut(ORIGIN * factor, factor)], 1 / factor);

      expect(inkOf(at1to1), 'the reference render drew nothing').toBeGreaterThan(200);

      const { fraction, worst } = compare(at1to1, drawnZoomedOut);
      expect(
        fraction,
        `${(fraction * 100).toFixed(3)}% of subpixels differ (worst channel delta ${worst})`,
      ).toBeLessThan(TOLERANCE);
    });
  });
});

/**
 * A tolerance nothing can fail is not a check. These build the same drawings
 * with the scale left off — the exact mistake a new unguarded read of
 * `strokeWidth` or `fontSize` would produce — and insist the comparison
 * notices.
 */
describe('the comparison can tell a broken render from a correct one', () => {
  it.each([2, 4])('catches a stroke that was never scaled, at 1/%i zoom', (factor) => {
    const at1to1 = pixelsOf([createRectangle({ ...common, id: 's', ...box(1) })], 1);
    // The same larger geometry, but no `scale`: the stroke stayed 2 units
    // wide, so it comes out a fraction as thick on screen.
    const unscaled = createRectangle({ ...common, id: 's', ...box(factor) });

    const { fraction } = compare(at1to1, pixelsOf([unscaled], 1 / factor));
    expect(fraction).toBeGreaterThan(TOLERANCE);
  });

  it.each([2, 4])('catches text that was never scaled, at 1/%i zoom', (factor) => {
    const text = { text: 'Hg\nyq', fontSize: 20 };
    const at1to1 = pixelsOf([createText({ ...common, id: 's', x: ORIGIN, y: ORIGIN, ...text })], 1);
    const unscaled = createText({
      ...common,
      id: 's',
      x: ORIGIN * factor,
      y: ORIGIN * factor,
      ...text,
    });

    const { fraction } = compare(at1to1, pixelsOf([unscaled], 1 / factor));
    expect(fraction).toBeGreaterThan(TOLERANCE);
  });
});
