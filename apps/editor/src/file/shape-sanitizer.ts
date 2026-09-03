import { frameForShape, framesIn, sanitizeShape, type Shape } from '@canvasflow/canvas-engine';

/**
 * Rebuilding a whole board's worth of shapes from a file.
 *
 * The per-shape validation lives in the engine, which is also where the
 * awareness layer reaches it. What stays here is the part only a file needs:
 * a file arrives as an unordered pile of candidates, some of which will be
 * dropped, and frame membership has to be worked out afterwards from what
 * actually survived.
 */

export interface SanitizeResult {
  shapes: Shape[];
  /** Candidates that were dropped, so the UI can say so honestly. */
  skipped: number;
}

export function sanitizeShapes(
  candidates: readonly unknown[],
  genId: () => string,
): SanitizeResult {
  const shapes: Shape[] = [];
  let skipped = 0;
  for (const candidate of candidates) {
    const shape = sanitizeShape(candidate, genId);
    if (shape) {
      shapes.push(shape);
    } else {
      skipped += 1;
    }
  }

  // Membership, rebuilt from the geometry now that every shape has its new id.
  // Nothing about who was in which frame has to survive the file for this to
  // come out right — the shapes are where they were, so the answer is too.
  const frames = framesIn(shapes);
  const restored =
    frames.length === 0
      ? shapes
      : shapes.map((shape) => {
          const frameId = frameForShape(shape, frames);
          return frameId ? { ...shape, frameId } : shape;
        });

  return { shapes: restored, skipped };
}
