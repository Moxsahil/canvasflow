import {
  framesIn,
  lockSourcesOf,
  type FrameShape,
  type Shape,
  type ShapeUpdate,
} from '@canvasflow/canvas-engine';

/**
 * What Lock or Unlock does to a selection.
 *
 * Unlock when everything picked is locked already, and Lock otherwise — so a
 * selection with something still unlocked in it is finished off rather than
 * flipped half one way and half the other.
 *
 * Unlocking frees the selection whatever is holding it: its own flags, the
 * frames around it, and for an arrow the shapes it is attached to. Clearing
 * only the selected shapes' own flags would leave a member of a locked frame
 * exactly as locked as it was, under a menu that said Unlock.
 */
export function lockToggleFor(
  selectedIds: readonly string[],
  shapes: readonly Shape[],
  lockedIds: ReadonlySet<string>,
): { unlocking: boolean; updates: ShapeUpdate[] } {
  if (selectedIds.length === 0) return { unlocking: false, updates: [] };

  const unlocking = selectedIds.every((id) => lockedIds.has(id));
  if (unlocking) {
    return {
      unlocking,
      updates: lockSourcesOf(selectedIds, shapes).map((id) => ({ id, patch: { locked: false } })),
    };
  }
  return {
    unlocking,
    updates: selectedIds
      .filter((id) => !lockedIds.has(id))
      .map((id) => ({ id, patch: { locked: true } })),
  };
}

/** Every shape's own lock taken off, which frees everything held by one too. */
export function unlockAllUpdates(shapes: readonly Shape[]): ShapeUpdate[] {
  return shapes
    .filter((shape) => shape.locked === true)
    .map((shape) => ({ id: shape.id, patch: { locked: false } }));
}

/**
 * The frames a shape may be put in. A locked frame takes nothing new: whatever
 * joined it would be locked the moment it arrived, which is a shape someone
 * had just drawn or dragged there and could no longer touch.
 */
export function joinableFrames(
  shapes: readonly Shape[],
  lockedIds: ReadonlySet<string>,
): FrameShape[] {
  const frames = framesIn(shapes);
  return lockedIds.size === 0 ? frames : frames.filter((frame) => !lockedIds.has(frame.id));
}

/** The shapes nothing is holding, for the gestures that pass over locked ones. */
export function withoutLocked<T extends { readonly id: string }>(
  items: readonly T[],
  lockedIds: ReadonlySet<string>,
): readonly T[] {
  return lockedIds.size === 0 ? items : items.filter((item) => !lockedIds.has(item.id));
}
