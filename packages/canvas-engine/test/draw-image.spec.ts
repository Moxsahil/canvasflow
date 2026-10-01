import { createCanvas, loadImage } from 'canvas';
import { renderSceneToCanvas } from '../src/export/export-scene.js';
import { drawImageShape, type ImageSource } from '../src/renderers/draw-image.js';
import { createImage } from '../src/shapes/image.js';

const colors = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
  [255, 255, 0, 255],
];

const cases = [
  { name: 'unflipped', flipX: false, flipY: false, order: [0, 1, 2, 3] },
  { name: 'horizontal', flipX: true, flipY: false, order: [1, 0, 3, 2] },
  { name: 'vertical', flipX: false, flipY: true, order: [2, 3, 0, 1] },
  { name: 'both axes', flipX: true, flipY: true, order: [3, 2, 1, 0] },
];

function image(overrides: Partial<Parameters<typeof createImage>[0]> = {}) {
  return createImage({
    id: 'image',
    x: 13,
    y: 17,
    width: 40,
    height: 20,
    fileId: 'four-colors',
    mimeType: 'image/png',
    naturalWidth: 20,
    naturalHeight: 20,
    status: 'saved',
    ...overrides,
  });
}

function source(): ImageSource {
  const bitmap = createCanvas(20, 20);
  const ctx = bitmap.getContext('2d');
  for (const [index, color] of ['#ff0000', '#00ff00', '#0000ff', '#ffff00'].entries()) {
    ctx.fillStyle = color;
    ctx.fillRect((index % 2) * 10, Math.floor(index / 2) * 10, 10, 10);
  }
  return { get: () => bitmap as unknown as CanvasImageSource };
}

type PixelContext = {
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
};

function corners(ctx: PixelContext, x: number, y: number, width: number, height: number) {
  return [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ].map(([dx, dy]) => Array.from(ctx.getImageData(x + width * dx!, y + height * dy!, 1, 1).data));
}

describe('image bitmap reflection', () => {
  it.each(cases)(
    'paints the actual $name pixels inside the same box',
    ({ flipX, flipY, order }) => {
      const canvas = createCanvas(100, 60);
      const ctx = canvas.getContext('2d');
      const shape = image({ flipX, flipY });
      drawImageShape(ctx as unknown as CanvasRenderingContext2D, shape, source());

      expect(corners(ctx, 13, 17, 40, 20)).toEqual(order.map((index) => colors[index]));
      expect(Array.from(ctx.getImageData(12, 17, 1, 1).data)).toEqual([0, 0, 0, 0]);
      expect(Array.from(ctx.getImageData(53, 17, 1, 1).data)).toEqual([0, 0, 0, 0]);
      expect(shape).toMatchObject({ x: 13, y: 17, width: 40, height: 20, fileId: 'four-colors' });
    },
  );

  it('restores the incoming transform and leaves the next image unflipped', () => {
    const canvas = createCanvas(200, 120);
    const ctx = canvas.getContext('2d');
    ctx.translate(3, 5);
    ctx.scale(2, 2);
    const initial = ctx.getTransform();
    const bitmaps = source();
    drawImageShape(
      ctx as unknown as CanvasRenderingContext2D,
      image({ flipX: true, flipY: true }),
      bitmaps,
    );

    expect(ctx.getTransform()).toEqual(initial);
    drawImageShape(
      ctx as unknown as CanvasRenderingContext2D,
      image({ x: 60, width: 20 }),
      bitmaps,
    );
    expect(corners(ctx, 123, 39, 40, 40)).toEqual(colors);
  });

  it('restores canvas state even when drawing the bitmap fails', () => {
    const ctx = createCanvas(100, 60).getContext('2d');
    ctx.translate(3, 5);
    ctx.globalAlpha = 0.5;
    const initial = ctx.getTransform();
    const draw = vi.spyOn(ctx, 'drawImage').mockImplementationOnce(() => {
      throw new Error('decode failed');
    });

    expect(() =>
      drawImageShape(ctx as unknown as CanvasRenderingContext2D, image({ flipX: true }), source()),
    ).toThrow('decode failed');
    expect(ctx.getTransform()).toEqual(initial);
    expect(ctx.globalAlpha).toBe(0.5);
    draw.mockRestore();
  });

  it.each(['pending', 'error'] as const)('leaves the %s placeholder readable', (status) => {
    const plain = createCanvas(140, 100).getContext('2d');
    const flipped = createCanvas(140, 100).getContext('2d');
    const shape = image({ width: 100, height: 60, status });
    drawImageShape(plain as unknown as CanvasRenderingContext2D, shape, undefined);
    drawImageShape(
      flipped as unknown as CanvasRenderingContext2D,
      { ...shape, flipX: true, flipY: true },
      undefined,
    );

    expect(flipped.getImageData(0, 0, 140, 100).data).toEqual(
      plain.getImageData(0, 0, 140, 100).data,
    );
  });

  it.each(cases)(
    'exports the actual $name pixels through PNG at 2×',
    async ({ flipX, flipY, order }) => {
      const canvas = createCanvas(1, 1);
      const size = renderSceneToCanvas(
        canvas as unknown as Parameters<typeof renderSceneToCanvas>[0],
        [image({ x: -130, y: 170, flipX, flipY })],
        { images: source(), padding: 3, scale: 2 },
      );
      expect(size).toEqual({ width: 92, height: 52 });

      const png = await loadImage(canvas.toBuffer('image/png'));
      const decoded = createCanvas(png.width, png.height).getContext('2d');
      decoded.drawImage(png, 0, 0);
      expect(corners(decoded, 6, 6, 80, 40)).toEqual(order.map((index) => colors[index]));
      expect(Array.from(decoded.getImageData(0, 0, 1, 1).data)).toEqual([0, 0, 0, 0]);
    },
  );
});
