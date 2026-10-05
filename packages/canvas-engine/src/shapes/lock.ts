/**
 * Which shapes are locked, and what is holding each of them.
 *
 * A shape is locked three ways. By its own flag, which is the only thing
 * stored. By standing in a frame that is locked, at any depth, since a frame
 * and what stands in it are one object. And, for an arrow, by being attached
 * to a shape that is locked — so a locked shape keeps its arrows with it
 * rather than having them pulled off it.
 *
 * The last two are worked out rather than written down. Unlocking the frame
 * or the shape frees everything it was holding, and there is no second flag
 * on the members or the arrows to fall out of step with the first.
 */

/** What lock depends on — every shape has these, whether as a plain object or as stored fields. */
export interface LockFacts {
  readonly id: string;
  readonly kind: string;
  readonly locked?: boolean;
  readonly frameId?: string | null;
  readonly startBinding?: { readonly shapeId: string } | null;
  readonly endBinding?: { readonly shapeId: string } | null;
}

/** Frames nest only so deep; a longer chain is a loop someone wrote, not a board. */
const MAX_FRAME_DEPTH = 64;

/** The shapes locked by any of the three. Empty — and cheap — on a board with no lock. */
export function lockedShapeIds(shapes: Iterable<LockFacts>): Set<string> {
  const all = [...shapes];
  if (!all.some((shape) => shape.locked === true)) return new Set();

  const byId = new Map(all.map((shape) => [shape.id, shape]));
  const locked = new Set<string>();
  for (const shape of all) {
    if (shape.locked === true || lockingFrames(shape, byId).length > 0) locked.add(shape.id);
  }
  for (const shape of all) {
    if (shape.kind !== 'arrow' || locked.has(shape.id)) continue;
    if (attachedTo(shape).some((id) => locked.has(id))) locked.add(shape.id);
  }
  return locked;
}

/**
 * The shapes whose own lock is holding `ids` locked: the shapes themselves
 * where they carry the flag, the frames around them that do, and for an
 * arrow, whatever is holding the shapes it is attached to. Clearing every
 * flag named here frees all of `ids`.
 */
export function lockSourcesOf(ids: Iterable<string>, shapes: Iterable<LockFacts>): string[] {
  const all = [...shapes];
  const byId = new Map(all.map((shape) => [shape.id, shape]));
  const locked = lockedShapeIds(all);
  const sources = new Set<string>();

  const holding = (shape: LockFacts) => {
    if (shape.locked === true) sources.add(shape.id);
    for (const frame of lockingFrames(shape, byId)) sources.add(frame.id);
  };

  for (const id of ids) {
    const shape = byId.get(id);
    if (!shape || !locked.has(id)) continue;
    holding(shape);
    if (shape.kind !== 'arrow') continue;
    for (const attachedId of attachedTo(shape)) {
      const attached = byId.get(attachedId);
      if (attached && locked.has(attachedId)) holding(attached);
    }
  }
  return [...sources];
}

/** The locked frames around a shape, innermost first. */
function lockingFrames(shape: LockFacts, byId: ReadonlyMap<string, LockFacts>): LockFacts[] {
  const frames: LockFacts[] = [];
  const seen = new Set<string>([shape.id]);
  let frameId = shape.frameId;
  for (let depth = 0; frameId && depth < MAX_FRAME_DEPTH; depth++) {
    if (seen.has(frameId)) break;
    seen.add(frameId);
    const frame = byId.get(frameId);
    if (!frame) break;
    if (frame.locked === true) frames.push(frame);
    frameId = frame.frameId;
  }
  return frames;
}

function attachedTo(arrow: LockFacts): string[] {
  const ids: string[] = [];
  if (arrow.startBinding?.shapeId) ids.push(arrow.startBinding.shapeId);
  if (arrow.endBinding?.shapeId) ids.push(arrow.endBinding.shapeId);
  return ids;
}
