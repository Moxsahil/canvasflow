import * as Y from 'yjs';
import { isUsername } from '@canvasflow/types';
import {
  cleanCommentBody,
  isCommentEmpty,
  type Comment,
  type CommentAnchor,
  type CommentAuthor,
  type CommentReaction,
  type CommentThread,
} from './comment-model';

/**
 * The board's comments, kept in the board's own document.
 *
 * Beside the shapes rather than among them: a map of threads under its own
 * name, each thread a map holding its comments in order. Being in the document
 * is what gives comments everything the shapes have for nothing — they reach
 * everyone on the board as they are written, survive a dropped connection, and
 * are saved with the board.
 *
 * Being beside the shapes is what keeps them out of undo. The undo stack
 * follows the shapes and nothing else, which is what a comment wants: undoing
 * a delete must not bring back a thread someone else has since removed, and
 * Ctrl+Z after posting should take back the last thing drawn, not what was
 * just said.
 *
 * Everything read out of the document is checked field by field. Another
 * client wrote it, possibly an older one, and one malformed thread must cost
 * that thread and not the board.
 */
export class CommentStore {
  private readonly threads: Y.Map<Y.Map<unknown>>;
  private readonly listeners = new Set<() => void>();
  private snapshot: CommentThread[] | null = null;

  constructor(
    private readonly yDoc: Y.Doc,
    /** Asked before every write: a viewer's would be refused by the server and leave this copy out of step. */
    private readonly canWrite: () => boolean,
    private readonly newId: (kind: 'thread' | 'comment') => string = defaultId,
    private readonly now: () => number = Date.now,
  ) {
    this.threads = yDoc.getMap<Y.Map<unknown>>('comments');
    // Watched from the start and for as long as the document lives, whether or
    // not anyone is listening: the list below is only good until the next
    // change, and a change nobody heard would leave it stale.
    this.threads.observeDeep(() => {
      this.snapshot = null;
      for (const listener of this.listeners) listener();
    });
  }

  /** Every thread, oldest first. The same array until something changes. */
  /**
   * The map the threads are kept in, for the board's undo history to take in:
   * a board edit that moves pins — a flip — is undone with them. Edits made
   * here are written under this store's own origin, and stay out of undo.
   */
  get undoScope(): Y.Map<Y.Map<unknown>> {
    return this.threads;
  }

  getThreads(): CommentThread[] {
    if (!this.snapshot) {
      const threads: CommentThread[] = [];
      this.threads.forEach((value, id) => {
        const thread = readThread(id, value);
        if (thread) threads.push(thread);
      });
      this.snapshot = threads.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    }
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Start a thread with its first comment. Returns its id, or null if nothing was written. */
  addThread(
    anchor: CommentAnchor,
    author: CommentAuthor,
    body: string,
    mentions: readonly CommentAuthor[] = [],
  ): string | null {
    const text = cleanCommentBody(body);
    if (!this.canWrite() || isCommentEmpty(text)) return null;

    const id = this.newId('thread');
    const at = this.now();
    this.yDoc.transact(() => {
      const thread = new Y.Map<unknown>();
      thread.set('createdBy', author.id);
      thread.set('createdAt', at);
      writeAnchor(thread, anchor);
      const comments = new Y.Array<Y.Map<unknown>>();
      comments.push([this.newComment(author, text, at, mentions)]);
      thread.set('comments', comments);
      this.threads.set(id, thread);
    }, ORIGIN);
    return id;
  }

  /** Reply to a thread. Nothing happens if the thread has gone. */
  addComment(
    threadId: string,
    author: CommentAuthor,
    body: string,
    mentions: readonly CommentAuthor[] = [],
  ): string | null {
    const text = cleanCommentBody(body);
    const comments = this.commentsOf(threadId);
    if (!this.canWrite() || !comments || isCommentEmpty(text)) return null;

    const comment = this.newComment(author, text, this.now(), mentions);
    this.yDoc.transact(() => comments.push([comment]), ORIGIN);
    return comment.get('id') as string;
  }

  /** Replace a comment's body and who it names, and mark it as edited. */
  editComment(
    threadId: string,
    commentId: string,
    body: string,
    mentions: readonly CommentAuthor[] = [],
  ): void {
    const text = cleanCommentBody(body);
    const found = this.findComment(threadId, commentId);
    if (!this.canWrite() || !found || isCommentEmpty(text)) return;
    if (found.comment.get('body') === text) return;

    this.yDoc.transact(() => {
      found.comment.set('body', text);
      found.comment.set('editedAt', this.now());
      writeMentions(found.comment, mentions);
    }, ORIGIN);
  }

  /**
   * Leave an emoji on a comment, or take back the one already left: the same
   * call does both, as the same press does.
   *
   * Each person's each emoji is a key of its own on the comment, so two people
   * reacting at once add two keys and neither overwrites the other.
   */
  toggleReaction(threadId: string, commentId: string, user: CommentAuthor, emoji: string): void {
    const found = this.findComment(threadId, commentId);
    const mark = emoji.trim();
    if (!this.canWrite() || !found || !isReactionEmoji(mark)) return;

    const key = `${REACTION}${mark}:${user.id}`;
    this.yDoc.transact(() => {
      if (found.comment.has(key)) found.comment.delete(key);
      else found.comment.set(key, { name: user.name, at: this.now() });
    }, ORIGIN);
  }

  /**
   * Remove a comment. The thread goes with its last one: a pin with nothing
   * under it is not a conversation.
   */
  deleteComment(threadId: string, commentId: string): void {
    const found = this.findComment(threadId, commentId);
    if (!this.canWrite() || !found) return;

    this.yDoc.transact(() => {
      if (found.comments.length <= 1) this.threads.delete(threadId);
      else found.comments.delete(found.index, 1);
    }, ORIGIN);
  }

  deleteThread(threadId: string): void {
    if (!this.canWrite() || !this.threads.has(threadId)) return;
    this.yDoc.transact(() => this.threads.delete(threadId), ORIGIN);
  }

  /** Mark a thread settled, by whom and when. */
  resolveThread(threadId: string, user: CommentAuthor): void {
    const thread = this.threads.get(threadId);
    if (!this.canWrite() || !thread) return;
    this.yDoc.transact(() => {
      thread.set('resolvedAt', this.now());
      thread.set('resolvedBy', user.id);
      thread.set('resolvedByName', user.name);
    }, ORIGIN);
  }

  reopenThread(threadId: string): void {
    const thread = this.threads.get(threadId);
    if (!this.canWrite() || !thread || thread.get('resolvedAt') == null) return;
    this.yDoc.transact(() => {
      thread.delete('resolvedAt');
      thread.delete('resolvedBy');
      thread.delete('resolvedByName');
    }, ORIGIN);
  }

  /** Put a thread's pin somewhere else. */
  moveThread(threadId: string, anchor: CommentAnchor): void {
    const thread = this.threads.get(threadId);
    if (!this.canWrite() || !thread) return;
    this.yDoc.transact(() => writeAnchor(thread, anchor), ORIGIN);
  }

  /**
   * Note where the pins on these shapes are standing, for shapes about to go.
   *
   * A pin on a shape is placed from the shape, and its own point is only as
   * fresh as the last time it was put down. Left alone, deleting a shape that
   * had since been moved would send its pins back to where the shape was when
   * each comment was made.
   */
  holdPins(
    shapeIds: ReadonlySet<string>,
    pointOf: (thread: CommentThread) => CommentAnchor['point'],
  ): void {
    if (!this.canWrite() || shapeIds.size === 0) return;
    const held = this.getThreads().filter(
      (thread) => thread.anchor.shapeId !== null && shapeIds.has(thread.anchor.shapeId),
    );
    if (held.length === 0) return;

    this.yDoc.transact(() => {
      for (const thread of held) {
        const point = pointOf(thread);
        const stored = this.threads.get(thread.id);
        if (!stored) continue;
        stored.set('px', point.x);
        stored.set('py', point.y);
      }
    }, ORIGIN);
  }

  /**
   * Reflect the pins on these shapes as the shapes were reflected, about the
   * same point.
   *
   * A pin keeps its place as a fraction of its shape's box, so without this a
   * pin on the left of a photo stays on the left while the photo mirrors under
   * it. Mirroring the fraction keeps it on what it was about; the point it
   * falls back to without the shape is reflected too.
   *
   * Called inside the flip's own edit, so undoing the flip puts the pins back.
   */
  mirrorPins(
    shapeIds: ReadonlySet<string>,
    axis: 'horizontal' | 'vertical',
    center: CommentAnchor['point'],
  ): void {
    if (!this.canWrite() || shapeIds.size === 0) return;
    const held = this.getThreads().filter(
      (thread) => thread.anchor.shapeId !== null && shapeIds.has(thread.anchor.shapeId),
    );
    if (held.length === 0) return;

    this.yDoc.transact(() => {
      for (const { id, anchor } of held) {
        const stored = this.threads.get(id);
        if (!stored) continue;
        if (axis === 'horizontal') {
          stored.set('ax', 1 - anchor.at.x);
          stored.set('px', 2 * center.x - anchor.point.x);
        } else {
          stored.set('ay', 1 - anchor.at.y);
          stored.set('py', 2 * center.y - anchor.point.y);
        }
      }
    }, ORIGIN);
  }

  private newComment(
    author: CommentAuthor,
    body: string,
    at: number,
    mentions: readonly CommentAuthor[],
  ): Y.Map<unknown> {
    const comment = new Y.Map<unknown>();
    comment.set('id', this.newId('comment'));
    comment.set('authorId', author.id);
    comment.set('authorName', author.name);
    if (author.username) comment.set('authorUsername', author.username);
    comment.set('createdAt', at);
    comment.set('body', body);
    writeMentions(comment, mentions);
    return comment;
  }

  private commentsOf(threadId: string): Y.Array<Y.Map<unknown>> | null {
    const comments = this.threads.get(threadId)?.get('comments');
    return comments instanceof Y.Array ? (comments as Y.Array<Y.Map<unknown>>) : null;
  }

  private findComment(threadId: string, commentId: string) {
    const comments = this.commentsOf(threadId);
    if (!comments) return null;
    for (let index = 0; index < comments.length; index++) {
      const comment = comments.get(index);
      if (comment instanceof Y.Map && comment.get('id') === commentId) {
        return { comments, comment, index };
      }
    }
    return null;
  }
}

/** Marks a transaction as a comment's, for anything watching the document that cares to tell. */
const ORIGIN = 'comments';

/** What a reaction's key on a comment begins with: `r:<emoji>:<user id>`. */
const REACTION = 'r:';
/** More people than a comment would name in earnest. */
const MOST_MENTIONS = 20;

/** Short, and free of the colon and the spaces a key is split on. */
function isReactionEmoji(mark: string): boolean {
  return mark.length > 0 && mark.length <= 32 && !/[:\s]/.test(mark);
}

function writeMentions(comment: Y.Map<unknown>, mentions: readonly CommentAuthor[]): void {
  const named = new Map(
    mentions.map(({ id, name, username }) => [id, { id, name, ...(username ? { username } : {}) }]),
  );
  if (named.size === 0) comment.delete('mentions');
  else comment.set('mentions', [...named.values()].slice(0, MOST_MENTIONS));
}

function defaultId(kind: 'thread' | 'comment'): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function writeAnchor(thread: Y.Map<unknown>, anchor: CommentAnchor): void {
  if (anchor.shapeId) {
    thread.set('shapeId', anchor.shapeId);
    thread.set('ax', anchor.at.x);
    thread.set('ay', anchor.at.y);
  } else {
    thread.delete('shapeId');
    thread.delete('ax');
    thread.delete('ay');
  }
  thread.set('px', anchor.point.x);
  thread.set('py', anchor.point.y);
}

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function readMentions(value: unknown): CommentAuthor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { id, name, username } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || name === '') return [];
    // Written by another browser, so held to the rules like a peer's presence.
    return [isUsername(username) ? { id, name, username } : { id, name }];
  });
}

function readReactions(comment: Y.Map<unknown>): CommentReaction[] {
  const given = new Map<string, { id: string; name: string; at: number }[]>();
  comment.forEach((value, key) => {
    if (!key.startsWith(REACTION)) return;
    const split = key.indexOf(':', REACTION.length);
    const emoji = key.slice(REACTION.length, split);
    const id = key.slice(split + 1);
    if (split === -1 || !isReactionEmoji(emoji) || id === '') return;

    const { name, at } = (typeof value === 'object' && value !== null ? value : {}) as Record<
      string,
      unknown
    >;
    const list = given.get(emoji) ?? [];
    list.push({ id, name: text(name) ?? '', at: finite(at) ?? 0 });
    given.set(emoji, list);
  });

  return [...given.entries()]
    .map(([emoji, list]) => ({
      emoji,
      first: Math.min(...list.map((entry) => entry.at)),
      by: list
        .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
        .map(({ id, name }) => ({ id, name })),
    }))
    .sort((a, b) => a.first - b.first || (a.emoji < b.emoji ? -1 : 1))
    .map(({ emoji, by }) => ({ emoji, by }));
}

function readComment(value: unknown): Comment | null {
  if (!(value instanceof Y.Map)) return null;
  const id = text(value.get('id'));
  const authorId = text(value.get('authorId'));
  const createdAt = finite(value.get('createdAt'));
  const body = text(value.get('body'));
  if (!id || !authorId || createdAt === null || body === null) return null;
  const authorUsername = value.get('authorUsername');

  return {
    id,
    authorId,
    authorName: text(value.get('authorName')) ?? '',
    authorUsername: isUsername(authorUsername) ? authorUsername : null,
    createdAt,
    editedAt: finite(value.get('editedAt')),
    body,
    mentions: readMentions(value.get('mentions')),
    reactions: readReactions(value),
  };
}

function readThread(id: string, value: unknown): CommentThread | null {
  if (!(value instanceof Y.Map)) return null;
  const createdBy = text(value.get('createdBy'));
  const createdAt = finite(value.get('createdAt'));
  const px = finite(value.get('px'));
  const py = finite(value.get('py'));
  const stored = value.get('comments');
  if (!createdBy || createdAt === null || px === null || py === null) return null;
  if (!(stored instanceof Y.Array)) return null;

  const comments = stored.toArray().flatMap((entry) => readComment(entry) ?? []);
  // Every comment unreadable, or the last one deleted by someone as this
  // client replied: a pin with nothing to show is not drawn.
  if (comments.length === 0) return null;

  const shapeId = text(value.get('shapeId'));
  const ax = finite(value.get('ax'));
  const ay = finite(value.get('ay'));
  const resolvedAt = finite(value.get('resolvedAt'));
  const resolvedBy = text(value.get('resolvedBy'));

  return {
    id,
    createdBy,
    createdAt,
    anchor: {
      shapeId: shapeId && ax !== null && ay !== null ? shapeId : null,
      at: { x: ax ?? 0.5, y: ay ?? 0.5 },
      point: { x: px, y: py },
    },
    resolved:
      resolvedAt !== null && resolvedBy
        ? { at: resolvedAt, by: resolvedBy, byName: text(value.get('resolvedByName')) ?? '' }
        : null,
    comments,
  };
}
