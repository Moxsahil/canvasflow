import { useMemo, useSyncExternalStore } from 'react';
import type { BoardDocument } from '@canvasflow/canvas-engine';
import { NoteLikeStore, type NoteLikes } from './note-likes';

/**
 * Who likes which note, and the store that changes it. It asks the document
 * whether it may write, so only those who can edit the board can like.
 */
export function useNoteLikes(doc: BoardDocument): { store: NoteLikeStore; likes: NoteLikes } {
  const store = useMemo(() => new NoteLikeStore(doc.yDoc, () => !doc.isReadOnly()), [doc]);
  const likes = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
  return { store, likes };
}
