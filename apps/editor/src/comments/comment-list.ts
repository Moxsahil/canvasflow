import type { CommentThread } from './comment-model';

/** Which threads the list is showing. */
export type CommentListFilter = 'open' | 'resolved' | 'all';

export const COMMENT_LIST_FILTERS: readonly { id: CommentListFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
];

/** When a thread was last added to: its newest comment. */
export function lastActivity(thread: CommentThread): number {
  return thread.comments.reduce((latest, comment) => Math.max(latest, comment.createdAt), 0);
}

/** How many threads each filter leaves, for the number beside its name. */
export function commentListCounts(
  threads: readonly CommentThread[],
): Record<CommentListFilter, number> {
  const resolved = threads.filter((thread) => thread.resolved !== null).length;
  return { open: threads.length - resolved, resolved, all: threads.length };
}

/** The threads a filter leaves, most recently active first. */
export function listedThreads(
  threads: readonly CommentThread[],
  filter: CommentListFilter,
): CommentThread[] {
  return threads
    .filter((thread) => filter === 'all' || (filter === 'resolved') === (thread.resolved !== null))
    .sort((a, b) => lastActivity(b) - lastActivity(a));
}

/** A comment as one line: its first line, which is all a row has room for. */
export function commentSnippet(body: string): string {
  return body.split('\n', 1)[0]!.trim();
}
