import { useMemo, useSyncExternalStore } from 'react';
import type { BoardDocument } from '@canvasflow/canvas-engine';
import type { CommentThread } from './comment-model';
import { CommentStore } from './comment-store';

/**
 * The board's comments, and the store that changes them.
 *
 * The store asks the document whether it may write, so a viewer's comments
 * follow the same rule as a viewer's shapes: the one place that says a board
 * is read-only says it for both.
 */
export function useComments(doc: BoardDocument): {
  store: CommentStore;
  threads: readonly CommentThread[];
} {
  const store = useMemo(() => new CommentStore(doc.yDoc, () => !doc.isReadOnly()), [doc]);
  const threads = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getThreads(),
    () => store.getThreads(),
  );
  return { store, threads };
}
