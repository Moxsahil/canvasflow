import { describe, expect, it } from 'vitest';
import {
  EmptySceneError,
  measureExportSize,
  renderSceneToCanvas,
} from '../src/export/export-scene';
import { createRectangle } from '../src/shapes/rectangle';
import { createFrame } from '../src/shapes/frame';

const rect = (x: number, y: number, width = 100, height = 50) =>
  createRectangle({ id: `r-${x}-${y}`, x, y, width, height, seed: 1, strokeColor: '#000000' });

function testCanvas() {
  return new OffscreenCanvas(1, 1) as unknown as Parameters<typeof renderSceneToCanvas>[0];
}

function pixelAt(canvas: OffscreenCanvas, x: number, y: number) {
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return { r, g, b, a };
}

describe('measureExportSize', () => {
  it('covers the content plus padding on every side', () => {
    expect(measureExportSize([rect(0, 0, 100, 50)], { padding: 10 })).toEqual({
      width: 120,
      height: 70,
    });
  });

  it('multiplies by the export scale', () => {
    expect(measureExportSize([rect(0, 0, 100, 50)], { padding: 10, scale: 3 })).toEqual({
      width: 360,
      height: 210,
    });
  });

  it('is unaffected by where the content sits in the world', () => {
    // The whole point of exporting from bounds rather than the viewport.
    const near = measureExportSize([rect(0, 0)], { padding: 10 });
    const far = measureExportSize([rect(9000, -4000)], { padding: 10 });
    expect(far).toEqual(near);
  });

  it('refuses an empty scene', () => {
    expect(() => measureExportSize([])).toThrow(EmptySceneError);
  });
});

describe('frame labels in the export box', () => {
  const framed = createFrame({ id: 'f', x: 0, y: 0, width: 200, height: 100, name: 'Poster' });

  it('makes room for the name a frame draws above itself', () => {
    // `shapeBounds` for a frame is the rectangle alone, but the label is drawn
    // in a band above it — taller than the default padding, so a box fitted to
    // the shapes came out with the labels sliced through the middle.
    const { height } = measureExportSize([framed], { padding: 10 });
    expect(height).toBeGreaterThan(100 + 10 * 2);
  });

  it('leaves a board without frames exactly as it was', () => {
    expect(measureExportSize([rect(0, 0, 100, 50)], { padding: 10 })).toEqual({
      width: 120,
      height: 70,
    });
  });
});

describe('an explicit region', () => {
  it('has a size even with nothing standing in it', () => {
    // An empty frame is a blank image of the frame's size, not nothing at all.
    expect(measureExportSize([], { region: { x: 0, y: 0, width: 320, height: 180 } })).toEqual({
      width: 320,
      height: 180,
    });
  });

  it('sizes the image by the region, not by what the shapes fill', () => {
    // A shape overhanging the region must not change the dimensions — the
    // whole reason a frame export passes its own rectangle.
    const region = { x: 0, y: 0, width: 200, height: 100 };

    expect(measureExportSize([rect(150, 50, 400, 400)], { region })).toEqual({
      width: 200,
      height: 100,
    });
  });

  it('is the crop exactly, so padding does not widen it', () => {
    // Padding turns a content bounding box into something with room around it.
    // A caller naming its own rectangle has already placed the edges.
    const region = { x: 0, y: 0, width: 200, height: 100 };

    expect(measureExportSize([rect(0, 0)], { region, padding: 40 })).toEqual({
      width: 200,
      height: 100,
    });
  });

  it('crops to the region rather than moving the content into view', () => {
    const canvas = new OffscreenCanvas(1, 1);
    renderSceneToCanvas(
      canvas as unknown as Parameters<typeof renderSceneToCanvas>[0],
      [rect(0, 0, 100, 50), rect(500, 500, 100, 50)],
      { region: { x: 0, y: 0, width: 200, height: 100 }, backgroundColor: '#ffffff' },
    );

    // The near shape is inside the region and drawn; the far one is outside it
    // and simply absent, rather than pulled in by a bounding box that grew to
    // include it.
    expect(pixelAt(canvas, 50, 25).a).toBeGreaterThan(0);
    expect(pixelAt(canvas, 150, 75)).toMatchObject({ r: 255, g: 255, b: 255 });
  });
});

describe('renderSceneToCanvas', () => {
  it('sizes the canvas to the content', () => {
    const canvas = testCanvas();
    const size = renderSceneToCanvas(canvas, [rect(0, 0, 100, 50)], { padding: 10 });
    expect(size).toEqual({ width: 120, height: 70 });
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(70);
  });

  it('paints the background when given one', () => {
    const canvas = testCanvas();
    renderSceneToCanvas(canvas, [rect(0, 0)], { backgroundColor: '#ff0000' });
    // Top-left corner is padding, so it shows background and nothing else.
    expect(pixelAt(canvas as unknown as OffscreenCanvas, 1, 1)).toMatchObject({
      r: 255,
      g: 0,
      b: 0,
      a: 255,
    });
  });

  it('leaves the image transparent when no background is given', () => {
    const canvas = testCanvas();
    renderSceneToCanvas(canvas, [rect(0, 0)]);
    expect(pixelAt(canvas as unknown as OffscreenCanvas, 1, 1).a).toBe(0);
  });

  it('draws content that lives far from the world origin', () => {
    // A board opened from a file sits wherever the file says; the export must
    // still contain it rather than a blank region near (0,0).
    const near = testCanvas();
    renderSceneToCanvas(near, [rect(0, 0)], { backgroundColor: '#ffffff' });
    const far = testCanvas();
    renderSceneToCanvas(far, [rect(8000, 6000)], { backgroundColor: '#ffffff' });

    const nearPixels = (near as unknown as OffscreenCanvas)
      .getContext('2d')!
      .getImageData(0, 0, near.width, near.height).data;
    const farPixels = (far as unknown as OffscreenCanvas)
      .getContext('2d')!
      .getImageData(0, 0, far.width, far.height).data;

    const ink = (data: Uint8ClampedArray) => {
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) count += 1;
      }
      return count;
    };

    expect(ink(nearPixels)).toBeGreaterThan(0);
    expect(ink(farPixels)).toBeGreaterThan(0);
  });

  it('refuses an empty scene', () => {
    expect(() => renderSceneToCanvas(testCanvas(), [])).toThrow(EmptySceneError);
  });
});
