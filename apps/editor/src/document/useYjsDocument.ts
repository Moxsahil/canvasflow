import { useEffect, useRef, useSyncExternalStore } from 'react';
import { BoardDocument, type Shape } from '@canvasflow/canvas-engine';

export function useBoardDocument(boardId: string, userId: string | null): BoardDocument {
  const ref = useRef<{ boardId: string; doc: BoardDocument } | null>(null);
  if (!ref.current || ref.current.boardId !== boardId) {
    if (ref.current) ref.current.doc.destroy();
    ref.current = { boardId, doc: new BoardDocument(undefined, userId) };
  }

  useEffect(() => {
    ref.current?.doc.setUserId(userId);
  }, [userId]);

  useEffect(() => {
    return () => {
      if (ref.current) {
        ref.current.doc.destroy();
        ref.current = null;
      }
    };
  }, []);
  return ref.current.doc;
}

export function useYjsShapes(doc: BoardDocument): Shape[] {
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
    getSnapshot,
  );
}
