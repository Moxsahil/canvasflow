import type { Rect } from '../math.js';
import type { FrameShape } from './shape.js';
import { resolveBaseStyle, type BaseStyleInput } from './style.js';

/** What a frame is called when it has been given no name of its own. */
export const DEFAULT_FRAME_NAME = 'Frame';

/** Label type size in screen pixels. Divided by zoom so it never scales. */
export const FRAME_LABEL_FONT_SIZE = 12;

/** Gap between the label's baseline and the frame's top edge, in screen pixels. */
export const FRAME_LABEL_GAP = 6;

/**
 * How close to an edge counts as touching it, in screen pixels.
 *
 * A frame's interior is not a hit target, so the border is the only part of a
 * large object there is to grab. At a true one-pixel line that is a test of
 * aim, and the failure is silent — the click falls through to the board and
 * clears the selection.
 */
export const FRAME_BORDER_HIT_TOLERANCE = 6;

export function createFrame(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    name?: string;
  },
): FrameShape {
  return {
    kind: 'frame',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    name: input.name ?? '',
    // Crisp by default, where every other shape is sketchy. A frame is
    // scaffolding rather than part of the drawing, and hand-drawn jitter on a
    // container reads as something someone meant, competing with the work
    // standing inside it.
    ...resolveBaseStyle({ ...input, roughness: input.roughness ?? 0 }),
  };
}

export function frameBounds(s: FrameShape): Rect {
  return { x: s.x, y: s.y, width: s.width, height: s.height };
}

/** What to draw above the frame — its name, or the default when it has none. */
export function frameLabel(s: FrameShape): string {
  return s.name.trim() === '' ? DEFAULT_FRAME_NAME : s.name;
}
