/**
 * Reading a colour off the board, for the bucket's pipette.
 *
 * Read from the drawn board rather than from the shapes, so what is picked up
 * is the colour seen under the pointer — a hatched fill, a half-faded shape,
 * a stroke over a fill — not whichever field of whichever shape is on top.
 */

const hex2 = (value: number) => Math.round(value).toString(16).padStart(2, '0');

/** `#rrggbb` (or `#rgb`) as channels. Anything else reads as white. */
function channels(color: string): [number, number, number] {
  const hex = color.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return [255, 255, 255];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * A pixel as the colour it shows, as `#rrggbb`.
 *
 * The board's canvas is transparent wherever nothing is drawn — its ground is
 * painted underneath, not into it — so a pixel is laid over that ground before
 * it is read: an empty spot reads as the board, and a faded shape as the blend
 * the eye sees.
 */
export function pixelOverGround(
  [r, g, b, a]: readonly [number, number, number, number],
  ground: string,
): string {
  const alpha = a / 255;
  const [gr, gg, gb] = channels(ground);
  return `#${hex2(r * alpha + gr * (1 - alpha))}${hex2(g * alpha + gg * (1 - alpha))}${hex2(
    b * alpha + gb * (1 - alpha),
  )}`;
}

/** The colour shown at a point on the page, read off the board's canvas. */
export function sampleBoardColor(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  ground: string,
): string {
  const box = canvas.getBoundingClientRect();
  const ctx = canvas.getContext('2d');
  if (!ctx || box.width === 0 || box.height === 0) return ground;
  const x = Math.floor((clientX - box.left) * (canvas.width / box.width));
  const y = Math.floor((clientY - box.top) * (canvas.height / box.height));
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return ground;
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return pixelOverGround([r!, g!, b!, a!], ground);
}

/** Whether a colour is dark enough that a ring around it should be light. */
export function isDarkColor(color: string): boolean {
  const [r, g, b] = channels(color);
  // Rec. 601 luma — plenty for choosing the colour of a ring.
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}
