import { shapeBounds, type Shape } from '@canvasflow/canvas-engine';
import type { HandleIndex } from '../machine/tool-machine.types';

const HANDLE_SIZE = 8;

/**
 * If (px, py) — in world coords — is on one of the shape's 8 handles,
 * return the handle index. Else return null.
 *
 * Called only when exactly one shape is selected.
 */
export function hitTestHandles(
  shape: Shape,
  px: number,
  py: number,
  zoom: number,
): HandleIndex | null {
  const b = shapeBounds(shape);
  const pad = 4 / zoom;
  const outerBounds = {
    x: b.x - pad,
    y: b.y - pad,
    width: b.width + pad * 2,
    height: b.height + pad * 2,
  };

  const halfHandle = HANDLE_SIZE / 2 / zoom;
  const cx = outerBounds.x + outerBounds.width / 2;
  const cy = outerBounds.y + outerBounds.height / 2;
  const right = outerBounds.x + outerBounds.width;
  const bottom = outerBounds.y + outerBounds.height;

  const positions: Array<[HandleIndex, number, number]> = [
    [0, outerBounds.x, outerBounds.y],
    [1, cx, outerBounds.y],
    [2, right, outerBounds.y],
    [3, right, cy],
    [4, right, bottom],
    [5, cx, bottom],
    [6, outerBounds.x, bottom],
    [7, outerBounds.x, cy],
  ];

  for (const [idx, hx, hy] of positions) {
    if (
      px >= hx - halfHandle &&
      px <= hx + halfHandle &&
      py >= hy - halfHandle &&
      py <= hy + halfHandle
    ) {
      return idx;
    }
  }
  return null;
}
