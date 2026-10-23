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
  /** A mind map topic's, for the branches folded away under it. */
  readonly kind?: string;
  readonly parentId?: string | null;
  readonly collapsed?: boolean;
}

/**
 * The topics folded away: everything further out along the branches of a
 * topic that is collapsed. They are kept on the board — a delete or a copy of
 * the folded topic takes them along — but drawn and found no more than a
 * hidden shape is, until the topic is opened again.
 */
export function foldedTopicIds(shapes: Iterable<VisibilityFacts>): Set<string> {
  const all = [...shapes];
  const folded = new Set<string>();
  if (!all.some((shape) => shape.kind === 'topic' && shape.collapsed === true)) return folded;

  const children = new Map<string, string[]>();
  for (const shape of all) {
    if (shape.kind !== 'topic' || typeof shape.parentId !== 'string') continue;
    const siblings = children.get(shape.parentId);
    if (siblings) siblings.push(shape.id);
    else children.set(shape.parentId, [shape.id]);
  }
  for (const shape of all) {
    if (shape.kind !== 'topic' || shape.collapsed !== true) continue;
    const stack = [...(children.get(shape.id) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      // A loop of parents comes back round to where it started; a topic is
      // never folded under itself.
      if (folded.has(id) || id === shape.id) continue;
      folded.add(id);
      stack.push(...(children.get(id) ?? []));
    }
  }
  return folded;
}

/** The shapes hidden either way. Empty — and cheap — on a board with nothing hidden. */
export function hiddenShapeIds(shapes: Iterable<VisibilityFacts>): Set<string> {
  const all = [...shapes];
  const folded = foldedTopicIds(all);
  if (!all.some((shape) => shape.hidden === true)) return folded;

  const byId = new Map(all.map((shape) => [shape.id, shape]));
  const hidden = folded;
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
