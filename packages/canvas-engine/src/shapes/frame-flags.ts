/**
 * The frames around a shape that carry some flag of their own.
 *
 * A frame and what stands in it are one object, so a frame that is locked or
 * hidden is the same for everything inside it, at any depth. Lock and
 * visibility both ask this one question, each about its own flag.
 */

/** What walking the frames needs: the shape's id and the frame it stands in. */
export interface FrameFacts {
  readonly id: string;
  readonly frameId?: string | null;
}

/** Frames nest only so deep; a longer chain is a loop someone wrote, not a board. */
const MAX_FRAME_DEPTH = 64;

/** The frames around `shape` for which `flagged` holds, innermost first. */
export function flaggedFramesAround<T extends FrameFacts>(
  shape: T,
  byId: ReadonlyMap<string, T>,
  flagged: (frame: T) => boolean,
): T[] {
  const frames: T[] = [];
  const seen = new Set<string>([shape.id]);
  let frameId = shape.frameId;
  for (let depth = 0; frameId && depth < MAX_FRAME_DEPTH; depth++) {
    if (seen.has(frameId)) break;
    seen.add(frameId);
    const frame = byId.get(frameId);
    if (!frame) break;
    if (flagged(frame)) frames.push(frame);
    frameId = frame.frameId;
  }
  return frames;
}
