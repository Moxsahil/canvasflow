import { useEffect, useMemo, useState } from 'react';
import type { CommentThread } from './comment-model';
import { isThreadUnread, readSeenThreads, storeSeenThreads, withThreadSeen } from './comment-seen';

/**
 * The threads with something in them this person has not read.
 *
 * Opening a thread reads it, and it stays read for as long as it is open: a
 * reply that arrives while the thread is on screen has been seen.
 */
export function useUnreadThreads(
  boardId: string,
  threads: readonly CommentThread[],
  userId: string | null,
  openThreadId: string | null,
): ReadonlySet<string> {
  const [seen, setSeen] = useState(() => readSeenThreads(boardId));

  const open = threads.find((thread) => thread.id === openThreadId) ?? null;
  useEffect(() => {
    if (!open) return;
    const next = withThreadSeen(seen, open);
    if (next === seen) return;
    storeSeenThreads(boardId, next);
    setSeen(next);
  }, [boardId, open, seen]);

  return useMemo(
    () =>
      new Set(
        threads.filter((thread) => isThreadUnread(thread, userId, seen)).map((thread) => thread.id),
      ),
    [threads, userId, seen],
  );
}
