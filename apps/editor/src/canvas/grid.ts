import type { Camera } from '../machine/tool-machine.types';

/**
 * The world-space distance between two adjacent dots of the finest grid, in
 * the units shapes are drawn in.
 */
export const GRID_SIZE = 10;

/**
 * The four grids drawn over one another, coarsest first.
 *
 * Each is `step` cells apart and fades in linearly between `min` and `mid`
 * zoom, reaching full strength at `mid` and holding it from there on. Stacking
 * them is what keeps the dots at a readable density across the whole zoom
 * range: any single spacing either collapses into a grey wash when you zoom
 * out or spreads to nothing when you zoom in, whereas four staggered ones hand
 * over to each other so there is always one at a comfortable distance.
 *
 * The first level's `min` is below zero so that it is already at full strength
 * at the lowest zoom the editor allows — it is the grid of last resort, and
 * fading it in would leave the far end of the range with no grid at all.
 */
const GRID_STEPS: readonly { min: number; mid: number; step: number }[] = [
  { min: -1, mid: 0.15, step: 64 },
  { min: 0.05, mid: 0.375, step: 16 },
  { min: 0.15, mid: 1, step: 4 },
  { min: 0.7, mid: 2.5, step: 1 },
];

/** One repeating field of dots, in screen pixels, ready to tile a pattern. */
export interface GridLevel {
  /** Its spacing in grid cells. Distinct per level, so it doubles as a key. */
  readonly step: number;
  /** Distance between adjacent dots, in screen pixels. */
  readonly spacing: number;
  /** Where the dot falls inside a tile, in screen pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Between 0 and 1, exclusive of 0 — a level at nothing is not returned. */
  readonly opacity: number;
}

/**
 * The grids to paint for a camera, coarsest first, leaving out the ones this
 * zoom has faded away entirely.
 *
 * Every level is anchored to the world origin rather than to the viewport, so
 * the dots stay fixed to the board as it pans: a tile repeats from the top-left
 * of the screen, and the dot inside it is placed at wherever world zero falls
 * within the first tile.
 */
export function gridLevels(camera: Camera): GridLevel[] {
  const { zoom } = camera;
  if (!Number.isFinite(zoom) || zoom <= 0) return [];

  // Half a pixel: it puts each dot in the middle of a device pixel instead of
  // astride two of them, which is the difference between a crisp dot and a
  // smudge.
  const originX = 0.5 - camera.x * zoom;
  const originY = 0.5 - camera.y * zoom;
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) return [];

  const levels: GridLevel[] = [];

  for (const { min, mid, step } of GRID_STEPS) {
    const spacing = step * GRID_SIZE * zoom;
    if (!Number.isFinite(spacing) || spacing <= 0) continue;

    const opacity = zoom >= mid ? 1 : (zoom - min) / (mid - min);
    if (opacity <= 0) continue;

    levels.push({
      step,
      spacing,
      offsetX: positiveRemainder(originX, spacing),
      offsetY: positiveRemainder(originY, spacing),
      opacity,
    });
  }

  return levels;
}

/**
 * `%` keeps the sign of the dividend, which for a camera panned past the world
 * origin would place the dot outside its own tile and leave a seam.
 */
function positiveRemainder(value: number, modulus: number): number {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}
