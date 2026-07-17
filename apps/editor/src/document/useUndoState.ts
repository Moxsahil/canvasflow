import { useSyncExternalStore } from 'react';
import type { BoardDocument } from '@canvasflow/canvas-engine';

interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Subscribe to undo/redo availability on a BoardDocument.
 * Re-renders when undo/redo stack changes so buttons update their disabled state.
 */
export function useUndoState(doc: BoardDocument): UndoState {
  const getSnapshot = () => ({
    canUndo: doc.canUndo(),
    canRedo: doc.canRedo(),
  });

  return useSyncExternalStore(
    (listener) => doc.onUndoChange(listener),
    () => {
      // Simple recomputed snapshot; small object so identity change on
      // real state change is fine (no infinite loops)
      return snapshotCache.get(doc, getSnapshot);
    },
    () => ({ canUndo: false, canRedo: false }),
  );
}

/**
 * Tiny cache keyed by doc that returns the same object reference until
 * the underlying state changes. Prevents useSyncExternalStore from
 * seeing "new snapshot" on every render.
 */
const snapshotCache = {
  cache: new WeakMap<BoardDocument, { canUndo: boolean; canRedo: boolean }>(),
  get(doc: BoardDocument, compute: () => UndoState): UndoState {
    const fresh = compute();
    const cached = this.cache.get(doc);
    if (cached && cached.canUndo === fresh.canUndo && cached.canRedo === fresh.canRedo) {
      return cached;
    }
    this.cache.set(doc, fresh);
    return fresh;
  },
};
