import {
  computeBoundingRect,
  hitTest,
  type Shape,
  type SpatialIndex,
} from '@canvasflow/canvas-engine';
import type { Point } from '../machine/tool-machine.types';
import type { ContextMenuTarget } from './context-menu-items';

export interface ContextPress {
  /** Which menu the press opens. */
  target: ContextMenuTarget;
  /** The selection to put in place before it opens, or null to leave it as it is. */
  select: readonly string[] | null;
}

/**
 * Settle what a right-click is about, before the menu that answers it opens.
 *
 * Every row in the selection menu acts on the selection, so the selection has
 * to be the thing that was clicked:
 *
 * - Inside the box around what is already selected keeps it, gaps included.
 *   Right-clicking between two picked shapes means the pair, not the board.
 * - On a shape outside it picks that shape alone.
 * - On empty board clears the selection and opens the board's menu, so no row
 *   there can act on shapes you are not looking at.
 */
export function contextPressAt(
  point: Point,
  shapes: readonly Shape[],
  selectedIds: readonly string[],
  index: SpatialIndex,
  zoom: number,
  lockedIds: ReadonlySet<string> = new Set(),
): ContextPress {
  if (selectedIds.length > 0) {
    const selected = new Set(selectedIds);
    const bounds = computeBoundingRect(shapes.filter((shape) => selected.has(shape.id)));
    if (
      bounds &&
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    ) {
      return { target: 'selection', select: null };
    }
  }

  // A locked shape is passed over for whatever unlocked one is under it, as
  // a left click passes over it — and taken only when nothing else is there,
  // because a right-click is the one way to pick a locked shape out to
  // unlock it.
  const unlocked =
    lockedIds.size === 0 ? shapes : shapes.filter((shape) => !lockedIds.has(shape.id));
  const hit =
    hitTest(unlocked, index, point.x, point.y, zoom) ??
    (lockedIds.size === 0 ? null : hitTest(shapes, index, point.x, point.y, zoom));
  if (hit) return { target: 'selection', select: [hit.id] };

  return { target: 'canvas', select: selectedIds.length > 0 ? [] : null };
}
