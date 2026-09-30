import { lastActivity } from './comment-list';
import type { CommentThread } from './comment-model';

export const COMMENTS_SEEN_PREFIX = 'cf:comments-seen:';

/** How many threads' worth of reading is remembered for one board. */
const KEPT = 500;

/** For each thread that has been opened here: how far into it the reading got. */
export type SeenThreads = Readonly<Record<string, number>>;

/**
 * Per board, and per device.
 *
 * What someone has read is theirs and not the board's: written into the
 * document, one person opening a thread would mark it read for everyone. So it
 * is kept where the view of the board is kept, local to whoever is looking.
 */
export const commentsSeenKey = (boardId: string) => `${COMMENTS_SEEN_PREFIX}${boardId}`;

/** What has been read on this board, or nothing at all on a first visit. */
export function readSeenThreads(boardId: string): SeenThreads {
  try {
    const stored = localStorage.getItem(commentsSeenKey(boardId));
    if (!stored) return {};

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

    const seen: Record<string, number> = {};
    for (const [threadId, at] of Object.entries(parsed)) {
      if (typeof at === 'number' && Number.isFinite(at)) seen[threadId] = at;
    }
    return seen;
  } catch {
    // Unreadable storage just means every thread reads as new.
    return {};
  }
}

export function storeSeenThreads(boardId: string, seen: SeenThreads): void {
  try {
    // The most recently read are the ones still likely to be on the board.
    const kept = Object.entries(seen)
      .sort((a, b) => b[1] - a[1])
      .slice(0, KEPT);
    localStorage.setItem(commentsSeenKey(boardId), JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // What was read just won't be remembered past a reload.
  }
}

/**
 * Whether a thread holds something this person has not read.
 *
 * It does when the last word in it is someone else's and arrived after the
 * thread was last opened here. One's own comment is never news, and a resolved
 * thread is not asking to be read.
 */
export function isThreadUnread(
  thread: CommentThread,
  userId: string | null,
  seen: SeenThreads,
): boolean {
  if (thread.resolved !== null) return false;
  const last = thread.comments[thread.comments.length - 1];
  if (!last || last.authorId === userId) return false;
  return lastActivity(thread) > (seen[thread.id] ?? 0);
}

/**
 * The record with this thread read as far as it goes. The same record when it
 * already was, so a caller can tell there is nothing to store.
 */
export function withThreadSeen(seen: SeenThreads, thread: CommentThread): SeenThreads {
  const upTo = lastActivity(thread);
  if ((seen[thread.id] ?? 0) >= upTo) return seen;
  return { ...seen, [thread.id]: upTo };
}
