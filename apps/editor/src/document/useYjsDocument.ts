import { useEffect, useRef, useSyncExternalStore } from 'react';
import { BoardDocument, type Shape } from '@canvasflow/canvas-engine';

/**
 * Get a stable BoardDocument instance for this Editor mount.
 * Recreates only if the `boardId` changes.
 */
export function useBoardDocument(boardId: string): BoardDocument {
  const ref = useRef<{ boardId: string; doc: BoardDocument } | null>(null);

  if (!ref.current || ref.current.boardId !== boardId) {
    // Destroy the previous doc (if any) when boardId changes
    if (ref.current) ref.current.doc.destroy();
    ref.current = { boardId, doc: new BoardDocument() };
  }

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (ref.current) {
        ref.current.doc.destroy();
        ref.current = null;
      }
    };
  }, []);

  return ref.current.doc;
}

/**
 * Subscribe to shape changes in a BoardDocument. Returns the current shapes,
 * re-rendering whenever any shape is added, removed, or modified.
 *
 * Uses useSyncExternalStore — React 18's correct API for external mutable
 * stores. Handles concurrent rendering correctly (unlike ad-hoc useState
 * patterns that can miss updates in concurrent mode).
 */
export function useYjsShapes(doc: BoardDocument): Shape[] {
  // We cache the last snapshot so React sees a stable reference when nothing
  // has changed. Without this, useSyncExternalStore's equality check would
  // fail on every render and cause infinite loops.
  const cacheRef = useRef<{ version: number; shapes: Shape[] }>({
    version: -1,
    shapes: [],
  });
  const versionRef = useRef(0);

  const getSnapshot = () => {
    if (cacheRef.current.version === versionRef.current) {
      return cacheRef.current.shapes;
    }
    const shapes = doc.getShapes();
    cacheRef.current = { version: versionRef.current, shapes };
    return shapes;
  };

  return useSyncExternalStore(
    (listener) => {
      const unsubscribe = doc.onChange(() => {
        versionRef.current += 1;
        listener();
      });
      return unsubscribe;
    },
    getSnapshot,
    getSnapshot, // server snapshot — same as client for SSR-safety (unused in our SPA)
  );
}
