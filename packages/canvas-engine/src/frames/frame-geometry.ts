/**
 * Where a frame's label sits, and what counts as clicking the frame itself.
 *
 * Both are expressed in world units but derived from screen ones, because the
 * label and the grab band are chrome: they have to stay the same size under
 * the pointer at every zoom, or a frame becomes unusable when you zoom out and
 * its border thins to nothing.
 */

import type { Rect } from '../math.js';
import { pointInRect } from '../math.js';
import {
  FRAME_BORDER_HIT_TOLERANCE,
  FRAME_LABEL_FONT_SIZE,
  FRAME_LABEL_GAP,
  frameLabel,
} from '../shapes/frame.js';
import type { FrameShape } from '../shapes/shape.js';
import { measureTextWidth } from '../utils/text-measure.js';

/** Kept in step with what the renderer draws, or the label and its hit box drift apart. */
export const FRAME_LABEL_FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

export function frameLabelFont(zoom: number): string {
  return `${FRAME_LABEL_FONT_SIZE / zoom}px ${FRAME_LABEL_FONT_FAMILY}`;
}

/**
 * The label's box in world units, sitting on top of the frame's left corner.
 *
 * Clamped to the frame's own width, so a long name on a small frame is cut off
 * rather than running out over the board and swallowing clicks meant for
 * whatever is beside it.
 */
export function frameLabelBounds(frame: FrameShape, zoom: number): Rect {
  const height = (FRAME_LABEL_FONT_SIZE + FRAME_LABEL_GAP) / zoom;
  const measured = measureTextWidth(frameLabel(frame), frameLabelFont(zoom));

  return {
    x: frame.x,
    y: frame.y - height,
    width: Math.min(measured, frame.width),
    height,
  };
}

/**
 * The frame whose label is under this point, if any.
 *
 * Separate from {@link frameHitAt}, which answers for the border as well:
 * renaming is a gesture aimed at the name specifically, and double-clicking a
 * frame's edge should not open its label for editing.
 */
export function frameLabelAt(
  frames: readonly FrameShape[],
  x: number,
  y: number,
  zoom: number,
): FrameShape | null {
  // Topmost first, matching what the eye reports where two labels overlap.
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i]!;
    if (pointInRect({ x, y }, frameLabelBounds(frame, zoom))) return frame;
  }
  return null;
}

/**
 * Whether a click at this point should select the frame.
 *
 * The border and the label, never the interior. A frame is mostly empty space
 * that other people's work stands in, so treating its middle as a hit target
 * would mean every click meant for the board — starting a marquee, drawing the
 * next shape — grabbed the container instead. Both references land on the same
 * rule for the same reason.
 */
export function frameHitAt(frame: FrameShape, x: number, y: number, zoom: number): boolean {
  const slop = FRAME_BORDER_HIT_TOLERANCE / zoom;

  const beyondBorder =
    x < frame.x - slop ||
    x > frame.x + frame.width + slop ||
    y < frame.y - slop ||
    y > frame.y + frame.height + slop;

  if (!beyondBorder) {
    // Within the outer band: a hit on the border unless the point is far
    // enough in to be clear of every edge, which is the hollow middle. Either
    // way the label is above the frame and cannot be here, so this answers.
    return (
      x <= frame.x + slop ||
      x >= frame.x + frame.width - slop ||
      y <= frame.y + slop ||
      y >= frame.y + frame.height - slop
    );
  }

  // Measured last, and only for a point that could be in the label at all.
  // Every pointer move that lands anywhere else skips the measurement.
  return pointInRect({ x, y }, frameLabelBounds(frame, zoom));
}
