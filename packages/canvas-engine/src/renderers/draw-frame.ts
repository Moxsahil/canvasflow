/**
 * Painting a frame.
 *
 * Drawn directly rather than through rough.js, unlike every other closed
 * shape. A frame is furniture: it marks out where the work goes, so a wobbling
 * hand-drawn border would read as one more thing someone drew, competing with
 * the contents for attention instead of holding them.
 *
 * The body draws in z-order with everything else. The label does not — it sits
 * outside the frame, above its top edge, and is painted in a pass of its own
 * after the scene so nothing standing near the top of a frame can cover the
 * name of the frame it is standing in.
 */

import { frameLabel } from '../shapes/frame.js';
import { FRAME_LABEL_FONT_SIZE, FRAME_LABEL_GAP } from '../shapes/frame.js';
import { frameLabelFont } from '../frames/frame-geometry.js';
import type { FrameShape } from '../shapes/shape.js';
import { measureTextWidth } from '../utils/text-measure.js';

export function drawFrameBody(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frame: FrameShape,
): void {
  if (frame.fillColor) {
    ctx.fillStyle = frame.fillColor;
    ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  }

  ctx.save();
  ctx.strokeStyle = frame.strokeColor;
  ctx.lineWidth = frame.strokeWidth;
  if (frame.strokeStyle === 'dashed')
    ctx.setLineDash([frame.strokeWidth * 4, frame.strokeWidth * 3]);
  if (frame.strokeStyle === 'dotted') ctx.setLineDash([frame.strokeWidth, frame.strokeWidth * 2]);
  ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
  ctx.restore();
}

/** Cut everything after this drawn to the frame's interior. Caller saves/restores. */
export function clipToFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frame: FrameShape,
): void {
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.width, frame.height);
  ctx.clip();
}

/** As much of `text` as fits in `maxWidth`, ending in an ellipsis if it was cut. */
function truncateToWidth(text: string, font: string, maxWidth: number): string {
  if (measureTextWidth(text, font) <= maxWidth) return text;

  // Linear from the end rather than a binary search: a frame name is a few
  // words, and this runs once per frame per paint.
  for (let length = text.length - 1; length > 0; length--) {
    const candidate = `${text.slice(0, length)}…`;
    if (measureTextWidth(candidate, font) <= maxWidth) return candidate;
  }
  return '';
}

/**
 * The frame's name, above its top-left corner.
 *
 * Sized in screen pixels and divided by zoom, so it stays legible chrome at
 * every scale rather than growing into a headline when the board is zoomed in.
 */
export function drawFrameLabel(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frame: FrameShape,
  zoom: number,
): void {
  const font = frameLabelFont(zoom);
  const label = truncateToWidth(frameLabel(frame), font, frame.width);
  if (label === '') return;

  ctx.save();
  ctx.font = font;
  ctx.fillStyle = frame.strokeColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha *= frame.opacity / 100;
  ctx.fillText(label, frame.x, frame.y - FRAME_LABEL_GAP / zoom);
  ctx.restore();
}

/** How tall the label band is in world units — what the frame's chrome occupies. */
export function frameLabelHeight(zoom: number): number {
  return (FRAME_LABEL_FONT_SIZE + FRAME_LABEL_GAP) / zoom;
}
