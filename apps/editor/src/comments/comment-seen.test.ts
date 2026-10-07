import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentThread } from './comment-model';
import {
  commentsSeenKey,
  isThreadUnread,
  readSeenThreads,
  storeSeenThreads,
  withThreadSeen,
} from './comment-seen';

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  });
});

function thread(id: string, comments: [authorId: string, at: number][], resolved = false) {
  return {
    id,
    createdBy: comments[0]![0],
    createdAt: comments[0]![1],
    anchor: { shapeId: null, at: { x: 0.5, y: 0.5 }, point: { x: 0, y: 0 } },
    resolved: resolved ? { at: 999, by: 'u-ada', byName: 'Ada' } : null,
    comments: comments.map(([authorId, createdAt], i) => ({
      id: `${id}-c${i}`,
      authorId,
      authorName: authorId,
      authorUsername: null,
      createdAt,
      editedAt: null,
      body: 'Said',
      mentions: [],
      reactions: [],
    })),
  } satisfies CommentThread;
}

describe('isThreadUnread', () => {
  const theirs = thread('t1', [['u-grace', 100]]);

  it("takes someone else's comment for news until the thread is opened", () => {
    expect(isThreadUnread(theirs, 'u-ada', {})).toBe(true);
    expect(isThreadUnread(theirs, 'u-ada', withThreadSeen({}, theirs))).toBe(false);
  });

  it('is news again when a reply arrives after the thread was read', () => {
    const seen = withThreadSeen({}, theirs);
    const replied = thread('t1', [
      ['u-grace', 100],
      ['u-linus', 200],
    ]);

    expect(isThreadUnread(replied, 'u-ada', seen)).toBe(true);
  });

  it("never counts one's own last word", () => {
    const mine = thread('t2', [
      ['u-grace', 100],
      ['u-ada', 200],
    ]);

    expect(isThreadUnread(mine, 'u-ada', {})).toBe(false);
  });

  it('leaves a resolved thread alone', () => {
    expect(isThreadUnread(thread('t3', [['u-grace', 100]], true), 'u-ada', {})).toBe(false);
  });
});

describe('withThreadSeen', () => {
  it('gives the same record back when there is nothing new to note', () => {
    const theirs = thread('t1', [['u-grace', 100]]);
    const seen = withThreadSeen({}, theirs);

    expect(seen).toEqual({ t1: 100 });
    expect(withThreadSeen(seen, theirs)).toBe(seen);
  });
});

describe('what has been read, kept for a board', () => {
  it('comes back as it was stored, each board to its own', () => {
    storeSeenThreads('board-1', { t1: 100 });
    storeSeenThreads('board-2', { t9: 900 });

    expect(readSeenThreads('board-1')).toEqual({ t1: 100 });
    expect(readSeenThreads('board-2')).toEqual({ t9: 900 });
  });

  it('is nothing at all on a first visit, or when it cannot be read', () => {
    expect(readSeenThreads('board-1')).toEqual({});

    store[commentsSeenKey('board-1')] = 'not json';
    expect(readSeenThreads('board-1')).toEqual({});
  });

  it('drops what is not a time', () => {
    store[commentsSeenKey('board-1')] = JSON.stringify({ t1: 100, t2: 'soon', t3: null });
    expect(readSeenThreads('board-1')).toEqual({ t1: 100 });
  });

  it('keeps the most recently read when a board has had a great many threads', () => {
    const many = Object.fromEntries(Array.from({ length: 520 }, (_, i) => [`t${i}`, i]));
    storeSeenThreads('board-1', many);

    const kept = readSeenThreads('board-1');
    expect(Object.keys(kept)).toHaveLength(500);
    expect(kept.t519).toBe(519);
    expect(kept.t19).toBeUndefined();
  });
});
