import { flaggedFramesAround } from './frame-flags.js';

/**
 * Which shapes are hidden: by their own flag, or by standing in a hidden
 * frame at any depth — a frame and what stands in it are one object, and
 * hiding the frame hides all of it.
 *
 * A hidden shape is still on the board for everyone. It is only not drawn,
 * not exported, and not something a click, a marquee, a snap or an arrow
 * can find, until it is shown again.
 */

/** What visibility depends on. */
export interface VisibilityFacts {
  readonly id: string;
  readonly hidden?: boolean;
  readonly frameId?: string | null;
}

/** The shapes hidden either way. Empty — and cheap — on a board with nothing hidden. */
export function hiddenShapeIds(shapes: Iterable<VisibilityFacts>): Set<string> {
  const all = [...shapes];
  if (!all.some((shape) => shape.hidden === true)) return new Set();

  const byId = new Map(all.map((shape) => [shape.id, shape]));
  const hidden = new Set<string>();
  for (const shape of all) {
    if (
      shape.hidden === true ||
      flaggedFramesAround(shape, byId, (frame) => frame.hidden === true).length > 0
    ) {
      hidden.add(shape.id);
    }
  }
  return hidden;
}

/** The shapes that are drawn. The same list back when nothing is hidden. */
export function visibleShapes<T extends VisibilityFacts>(shapes: readonly T[]): readonly T[] {
  const hidden = hiddenShapeIds(shapes);
  return hidden.size === 0 ? shapes : shapes.filter((shape) => !hidden.has(shape.id));
}
