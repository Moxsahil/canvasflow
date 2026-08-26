import type { Rect } from '../math.js';
import type { ImageShape, ImageStatus } from './shape.js';
import { resolveBaseStyle, type BaseStyleInput } from './style.js';

/**
 * How large a newly inserted image may be, in world units, along its longer
 * axis. A photo straight off a phone is several thousand pixels on a side; at
 * 1:1 it would land far outside the viewport and read as "nothing happened".
 */
export const MAX_PLACED_IMAGE_EXTENT = 480;

export function createImage(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fileId: string;
    mimeType: string;
    naturalWidth: number;
    naturalHeight: number;
    status?: ImageStatus;
  },
): ImageShape {
  return {
    kind: 'image',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    fileId: input.fileId,
    mimeType: input.mimeType,
    naturalWidth: input.naturalWidth,
    naturalHeight: input.naturalHeight,
    status: input.status ?? 'pending',
    ...resolveBaseStyle(input),
    // An image paints its own pixels; the stroke and fill vocabulary the other
    // kinds share would only give the properties panel controls that do nothing.
    fillColor: null,
    strokeWidth: 1,
  };
}

/**
 * The size an image of these source dimensions should be placed at, fitted
 * inside `maxExtent` but never enlarged — upscaling a small icon to fill the
 * box would just show the user a blurry version of what they picked.
 */
export function fitPlacedImageSize(
  naturalWidth: number,
  naturalHeight: number,
  maxExtent: number = MAX_PLACED_IMAGE_EXTENT,
): { width: number; height: number } {
  const longest = Math.max(naturalWidth, naturalHeight);
  if (longest <= 0) return { width: maxExtent, height: maxExtent };

  const scale = Math.min(1, maxExtent / longest);
  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  };
}

export function imageBounds(s: ImageShape): Rect {
  return { x: s.x, y: s.y, width: s.width, height: s.height };
}
