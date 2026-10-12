import * as Y from 'yjs';

/**
 * One comment as the board holds it right now, for the API gateway to email
 * about. Read here rather than taken from the browser that reports it, so an
 * email can only ever say what is really on the board, written by whoever is
 * really its author, about the people it really names.
 *
 * Kept in step with how the editor writes comments
 * (`apps/editor/src/comments/comment-store.ts`): a `comments` map of threads,
 * each holding a `comments` array of maps.
 */
export interface FoundComment {
  authorId: string;
  body: string;
  /** Each person named once, in the order named. */
  mentionIds: string[];
}

/** The most people one comment is taken to name, as the editor keeps it. */
const MOST_MENTIONS = 20;

export function findComment(doc: Y.Doc, threadId: string, commentId: string): FoundComment | null {
  const thread = doc.getMap<unknown>('comments').get(threadId);
  if (!(thread instanceof Y.Map)) return null;
  const comments = thread.get('comments');
  if (!(comments instanceof Y.Array)) return null;

  for (const comment of comments.toArray()) {
    if (!(comment instanceof Y.Map) || comment.get('id') !== commentId) continue;
    const authorId = comment.get('authorId');
    const body = comment.get('body');
    if (typeof authorId !== 'string' || typeof body !== 'string') return null;
    return { authorId, body, mentionIds: mentionIdsOf(comment.get('mentions')) };
  }
  return null;
}

function mentionIdsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const entry of value) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && id !== '') ids.add(id);
  }
  return [...ids].slice(0, MOST_MENTIONS);
}
