import type * as Y from 'yjs';

export interface NoteLike {
  readonly userId: string;
  /** The name they had when they liked it, for "Liked by". */
  readonly name: string;
  readonly at: number;
}

export interface NoteLikes {
  /** Each liked note's likes, newest first. A note nobody likes is not here. */
  readonly byNote: ReadonlyMap<string, readonly NoteLike[]>;
  /** The board's owner has hidden who likes what, until they show it again. */
  readonly hidden: boolean;
}

export interface Liker {
  readonly id: string;
  readonly name: string;
}

/**
 * Who likes which sticky note, kept in the board's own document.
 *
 * Beside the shapes rather than on them, as comments are: everyone on the
 * board sees a like as it is given, and undo, which follows the shapes, never
 * takes one back. A like belongs to its note's id, so a copy of the note
 * starts with none, and a deleted note brought back by undo has its likes
 * still waiting for it.
 *
 * One entry a person a note, under a key made of both. Two people liking the
 * same note at once write two different keys, so neither like is lost — a
 * map a note, made by whoever liked it first, would keep only one of them.
 *
 * Everything read is checked field by field: another client wrote it.
 */
export class NoteLikeStore {
  private readonly likes: Y.Map<unknown>;
  private readonly settings: Y.Map<unknown>;
  private readonly listeners = new Set<() => void>();
  private snapshot: NoteLikes | null = null;

  constructor(
    private readonly yDoc: Y.Doc,
    /** Asked before every write: a viewer's would be refused by the server and leave this copy out of step. */
    private readonly canWrite: () => boolean,
    private readonly now: () => number = Date.now,
  ) {
    this.likes = yDoc.getMap<unknown>('noteLikes');
    this.settings = yDoc.getMap<unknown>('noteLikeSettings');
    const changed = () => {
      this.snapshot = null;
      for (const listener of this.listeners) listener();
    };
    this.likes.observe(changed);
    this.settings.observe(changed);
  }

  /** The same object until something changes. */
  getSnapshot(): NoteLikes {
    if (!this.snapshot) {
      const byNote = new Map<string, NoteLike[]>();
      this.likes.forEach((value) => {
        const like = readLike(value);
        if (!like) return;
        const list = byNote.get(like.noteId);
        if (list) list.push(like.like);
        else byNote.set(like.noteId, [like.like]);
      });
      for (const list of byNote.values()) list.sort((a, b) => b.at - a.at);
      this.snapshot = { byNote, hidden: this.settings.get('hidden') === true };
    }
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Like the note, or take the like back. False when nothing was written. */
  toggle(noteId: string, liker: Liker): boolean {
    if (!this.canWrite()) return false;
    const key = likeKey(noteId, liker.id);
    this.yDoc.transact(() => {
      if (this.likes.has(key)) {
        this.likes.delete(key);
      } else {
        this.likes.set(key, { note: noteId, user: liker.id, name: liker.name, at: this.now() });
      }
    }, ORIGIN);
    return true;
  }

  /** Hide likes from everyone, or show them again. False when nothing was written. */
  setHidden(hidden: boolean): boolean {
    if (!this.canWrite()) return false;
    this.yDoc.transact(() => {
      if (hidden) this.settings.set('hidden', true);
      else this.settings.delete('hidden');
    }, ORIGIN);
    return true;
  }
}

const ORIGIN = 'noteLikes';

/** Ids are never empty and a user's never holds a newline, so the pair cannot be misread. */
function likeKey(noteId: string, userId: string): string {
  return `${noteId}\n${userId}`;
}

function readLike(value: unknown): { noteId: string; like: NoteLike } | null {
  if (typeof value !== 'object' || value === null) return null;
  const { note, user, name, at } = value as Record<string, unknown>;
  if (typeof note !== 'string' || note === '' || typeof user !== 'string' || user === '') {
    return null;
  }
  return {
    noteId: note,
    like: {
      userId: user,
      name: typeof name === 'string' ? name : '',
      at: typeof at === 'number' && Number.isFinite(at) ? at : 0,
    },
  };
}
