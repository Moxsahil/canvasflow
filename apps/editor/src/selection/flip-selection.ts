import {
  arrowsAffectedBy,
  boundArrowPatches,
  computeBoundingRect,
  flipShape,
  isArrow,
  isFrame,
  type BoardDocument,
  type FlipAxis,
  type Point,
  type Shape,
  type ShapeUpdate,
} from '@canvasflow/canvas-engine';
import { assignmentsAfterMove, membersHiddenByTheirFrame } from '../frames/frame-ops';

/** A bound arrow can reflect only when its targets reflect along with it. */
function selectionToFlip(ids: readonly string[], board: readonly Shape[]) {
  if (ids.length === 0) return { shapes: [], roots: [] };
  const selected = new Set(ids);
  const expanded = new Set(ids);
  const children = new Map<string, Shape[]>();
  const queue: string[] = [];
  for (const shape of board) {
    if (isFrame(shape) && selected.has(shape.id)) queue.push(shape.id);
    if (shape.frameId) {
      const siblings = children.get(shape.frameId);
      if (siblings) siblings.push(shape);
      else children.set(shape.frameId, [shape]);
    }
  }
  const visited = new Set<string>();
  const carried = new Set<string>();
  // Index once and visit each frame once, even when every nested frame is
  // selected. Repeated board scans make large frame selections needlessly slow.
  for (let i = 0; i < queue.length; i++) {
    const frameId = queue[i]!;
    if (visited.has(frameId)) continue;
    visited.add(frameId);
    for (const child of children.get(frameId) ?? []) {
      expanded.add(child.id);
      carried.add(child.id);
      if (isFrame(child)) queue.push(child.id);
    }
  }
  const candidates = board.filter((shape) => expanded.has(shape.id));
  const included = new Set(candidates.map((shape) => shape.id));
  const shapes = candidates.filter((shape) => {
    if (!isArrow(shape)) return true;
    return [shape.startBinding, shape.endBinding].every(
      (binding) => !binding || included.has(binding.shapeId),
    );
  });
  // Descendants travel with their frame, but do not enlarge its selection box.
  // An overflowing member must not shift a lone frame's pivot.
  const roots = shapes.filter((shape) => selected.has(shape.id) && !carried.has(shape.id));
  return { shapes, roots };
}

/** The point the selection is reflected about: the middle of the box around it. */
function pivotOf(roots: readonly Shape[]): Point | null {
  const bounds = computeBoundingRect(roots);
  if (!bounds || !Object.values(bounds).every(Number.isFinite)) return null;
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

export function canFlipSelection(ids: readonly string[], board: readonly Shape[]): boolean {
  return selectionToFlip(ids, board).roots.length > 0;
}

/** Plan geometry, dependent arrows and membership from one board snapshot. */
export function selectionFlipUpdates(
  ids: readonly string[],
  board: readonly Shape[],
  axis: FlipAxis,
): ShapeUpdate[] {
  return planSelectionFlip(ids, board, axis)?.updates ?? [];
}

/** A flip worked out: the edits, and what was reflected about which point. */
interface SelectionFlip {
  readonly updates: ShapeUpdate[];
  readonly center: Point;
  /**
   * The shapes whose content is mirrored, and anything resting on them with
   * it: every shape the flip takes in except text, which moves to its
   * reflected place and keeps its words the right way round.
   */
  readonly reflected: ReadonlySet<string>;
}

function planSelectionFlip(
  ids: readonly string[],
  board: readonly Shape[],
  axis: FlipAxis,
): SelectionFlip | null {
  const { shapes, roots } = selectionToFlip(ids, board);
  const center = pivotOf(roots);
  if (!center) return null;
  const next = new Map(board.map((shape) => [shape.id, shape]));
  const changed = new Set<string>();
  for (const shape of shapes) {
    const flipped = flipShape(shape, axis, center);
    if (flipped === shape) continue;
    next.set(shape.id, flipped);
    changed.add(shape.id);
  }
  if (changed.size === 0) return null;

  // External arrows stay attached. Selected arrows have already reflected
  // their normalized anchors, so resolving them now preserves those anchors.
  for (const patch of boundArrowPatches(arrowsAffectedBy([...next.values()], changed), next)) {
    const { id, ...geometry } = patch;
    next.set(id, { ...next.get(id)!, ...geometry } as Shape);
    changed.add(id);
  }

  // Include unchanged selected frames: their members still travelled as a
  // unit and must retain membership where other frames overlap them.
  const moved = new Set([...shapes.map((shape) => shape.id), ...changed]);
  for (const { id, frameId } of assignmentsAfterMove([...moved], [...next.values()])) {
    next.set(id, { ...next.get(id)!, frameId });
    changed.add(id);
  }

  const updates: ShapeUpdate[] = [];
  for (const original of board) {
    if (!changed.has(original.id)) continue;
    const after = next.get(original.id)!;
    const before = original as unknown as Record<string, unknown>;
    const fields = Object.entries(after).filter(([key, value]) => !Object.is(before[key], value));
    if (fields.length > 0) updates.push({ id: original.id, patch: Object.fromEntries(fields) });
  }
  if (updates.length === 0) return null;
  const reflected = new Set(shapes.filter((shape) => shape.kind !== 'text').map(({ id }) => id));
  return { updates, center, reflected };
}

/**
 * One command is one local sync update and one undo step.
 *
 * `alongside` is given what was reflected about which point, inside the same
 * edit, for anything kept outside the shapes that has to move with them: the
 * comments pinned to them. Undoing the flip undoes it too.
 */
export function flipSelection(
  doc: BoardDocument,
  ids: readonly string[],
  axis: FlipAxis,
  alongside?: (flip: { reflected: ReadonlySet<string>; center: Point }) => void,
): void {
  if (doc.isReadOnly()) return;
  const board = doc.getShapes();
  const plan = planSelectionFlip(ids, board, axis);
  if (!plan) return;
  const { updates } = plan;
  const joined = new Set(updates.filter(({ patch }) => patch.frameId != null).map(({ id }) => id));
  let bringToFront: string[] = [];
  if (joined.size > 0) {
    const patches = new Map(updates.map(({ id, patch }) => [id, patch]));
    const after = board.map((shape) => ({ ...shape, ...patches.get(shape.id) }) as Shape);
    // A new member below a filled frame would disappear. Repair just the new
    // memberships, including any descendants carried by a frame being raised.
    bringToFront = membersHiddenByTheirFrame(after, joined);
  }
  doc.breakUndoGroup();
  doc.batch(() => {
    doc.updateShapes(updates, { bringToFront });
    alongside?.({ reflected: plan.reflected, center: plan.center });
  });
  doc.breakUndoGroup();
}
