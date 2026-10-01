import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { CommentAnchor } from './comment-model';
import { CommentStore } from './comment-store';

const ada = { id: 'u-ada', name: 'Ada' };
const grace = { id: 'u-grace', name: 'Grace' };
const onBoard = (x: number, y: number): CommentAnchor => ({
  shapeId: null,
  at: { x: 0.5, y: 0.5 },
  point: { x, y },
});

/** A store over its own document, with ids and a clock a test can read. */
function board(doc = new Y.Doc(), canWrite = () => true) {
  let n = 0;
  let clock = 1000;
  const store = new CommentStore(
    doc,
    canWrite,
    (kind) => `${kind}-${++n}`,
    () => (clock += 1000),
  );
  return { doc, store };
}

describe('CommentStore', () => {
  it('starts a thread with its first comment', () => {
    const { store } = board();
    const id = store.addThread(onBoard(10, 20), ada, '  Is this the final colour?  ');

    expect(id).toBe('thread-1');
    expect(store.getThreads()).toEqual([
      {
        id: 'thread-1',
        createdBy: 'u-ada',
        createdAt: 2000,
        anchor: onBoard(10, 20),
        resolved: null,
        comments: [
          {
            id: 'comment-2',
            authorId: 'u-ada',
            authorName: 'Ada',
            createdAt: 2000,
            editedAt: null,
            body: 'Is this the final colour?',
            mentions: [],
            reactions: [],
          },
        ],
      },
    ]);
  });

  it('will not post a comment that says nothing', () => {
    const { store } = board();

    expect(store.addThread(onBoard(0, 0), ada, '   \n ')).toBeNull();
    expect(store.getThreads()).toEqual([]);
  });

  it('keeps replies in the order they were made', () => {
    const { store } = board();
    const id = store.addThread(onBoard(0, 0), ada, 'First')!;
    store.addComment(id, grace, 'Second');
    store.addComment(id, ada, 'Third');

    expect(store.getThreads()[0]!.comments.map((c) => [c.authorName, c.body])).toEqual([
      ['Ada', 'First'],
      ['Grace', 'Second'],
      ['Ada', 'Third'],
    ]);
  });

  it('marks an edited comment, and leaves an unchanged one unmarked', () => {
    const { store } = board();
    const id = store.addThread(onBoard(0, 0), ada, 'Teh colour')!;
    const commentId = store.getThreads()[0]!.comments[0]!.id;

    store.editComment(id, commentId, 'Teh colour');
    expect(store.getThreads()[0]!.comments[0]!.editedAt).toBeNull();

    store.editComment(id, commentId, 'The colour');
    expect(store.getThreads()[0]!.comments[0]).toMatchObject({
      body: 'The colour',
      editedAt: 3000,
    });
  });

  it('removes one reply, and the whole thread with its last comment', () => {
    const { store } = board();
    const id = store.addThread(onBoard(0, 0), ada, 'First')!;
    const reply = store.addComment(id, grace, 'Second')!;
    const first = store.getThreads()[0]!.comments[0]!.id;

    store.deleteComment(id, reply);
    expect(store.getThreads()[0]!.comments.map((c) => c.body)).toEqual(['First']);

    store.deleteComment(id, first);
    expect(store.getThreads()).toEqual([]);
  });

  it('settles a thread and reopens it', () => {
    const { store } = board();
    const id = store.addThread(onBoard(0, 0), ada, 'Done?')!;

    store.resolveThread(id, grace);
    expect(store.getThreads()[0]!.resolved).toEqual({ at: 3000, by: 'u-grace', byName: 'Grace' });

    store.reopenThread(id);
    expect(store.getThreads()[0]!.resolved).toBeNull();
  });

  it('moves a pin onto a shape and back onto the board', () => {
    const { store } = board();
    const id = store.addThread(onBoard(0, 0), ada, 'Here')!;

    store.moveThread(id, { shapeId: 's1', at: { x: 0.25, y: 0.75 }, point: { x: 40, y: 60 } });
    expect(store.getThreads()[0]!.anchor).toEqual({
      shapeId: 's1',
      at: { x: 0.25, y: 0.75 },
      point: { x: 40, y: 60 },
    });

    store.moveThread(id, onBoard(5, 6));
    expect(store.getThreads()[0]!.anchor).toEqual(onBoard(5, 6));
  });

  it('notes where the pins on doomed shapes stand, and leaves them attached', () => {
    const { store } = board();
    const on = store.addThread(
      { shapeId: 's1', at: { x: 0, y: 0 }, point: { x: 1, y: 1 } },
      ada,
      'A',
    )!;
    store.addThread({ shapeId: 's2', at: { x: 0, y: 0 }, point: { x: 2, y: 2 } }, ada, 'B');

    store.holdPins(new Set(['s1']), () => ({ x: 500, y: 600 }));

    const [first, second] = store.getThreads();
    expect(first).toMatchObject({ id: on, anchor: { shapeId: 's1', point: { x: 500, y: 600 } } });
    expect(second!.anchor.point).toEqual({ x: 2, y: 2 });
  });

  it('writes nothing for someone who may not', () => {
    const { store } = board(new Y.Doc(), () => false);

    expect(store.addThread(onBoard(0, 0), ada, 'Hello')).toBeNull();
    expect(store.getThreads()).toEqual([]);
  });

  it('hands out the same list until something changes', () => {
    const { store } = board();
    store.subscribe(() => {});
    store.addThread(onBoard(0, 0), ada, 'Hello');

    const before = store.getThreads();
    expect(store.getThreads()).toBe(before);
    store.addComment(before[0]!.id, grace, 'Hi');
    expect(store.getThreads()).not.toBe(before);
  });

  it('reaches everyone on the board, and merges what two people say at once', () => {
    const a = board();
    const b = board();
    const sync = () => {
      Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
      Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
    };
    let heard = 0;
    b.store.subscribe(() => heard++);

    const id = a.store.addThread(onBoard(0, 0), ada, 'Thoughts?')!;
    sync();
    expect(heard).toBeGreaterThan(0);
    expect(b.store.getThreads()[0]!.comments[0]!.body).toBe('Thoughts?');

    // Both reply before either hears the other.
    a.store.addComment(id, ada, 'From Ada');
    b.store.addComment(id, grace, 'From Grace');
    sync();

    const bodies = (store: CommentStore) => store.getThreads()[0]!.comments.map((c) => c.body);
    expect(bodies(a.store)).toHaveLength(3);
    expect(bodies(a.store)).toEqual(bodies(b.store));
  });

  it('stays out of the way of undo, which follows the shapes alone', () => {
    const { doc, store } = board();
    const shapes = doc.getArray<Y.Map<unknown>>('shapes');
    const undo = new Y.UndoManager(shapes, { trackedOrigins: new Set([null, 'local']) });

    doc.transact(() => shapes.push([new Y.Map()]), 'local');
    store.addThread(onBoard(0, 0), ada, 'Keep me');
    undo.undo();

    expect(shapes.length).toBe(0);
    expect(store.getThreads()).toHaveLength(1);
  });

  it('drops a thread it cannot read rather than the board', () => {
    const { doc, store } = board();
    store.addThread(onBoard(0, 0), ada, 'Fine');
    const threads = doc.getMap<unknown>('comments');
    doc.transact(() => {
      threads.set('junk', 'not a thread');
      const broken = new Y.Map<unknown>();
      broken.set('createdBy', 'u-x');
      broken.set('createdAt', 'yesterday');
      threads.set('broken', broken);
      // Text where a string belongs, as a shape once carried.
      const odd = new Y.Map<unknown>();
      odd.set('createdBy', 'u-x');
      odd.set('createdAt', 5);
      odd.set('px', 0);
      odd.set('py', 0);
      const comments = new Y.Array<Y.Map<unknown>>();
      const comment = new Y.Map<unknown>();
      comment.set('id', 'c');
      comment.set('authorId', 'u-x');
      comment.set('createdAt', 5);
      comment.set('body', new Y.Text('hi'));
      comments.push([comment]);
      odd.set('comments', comments);
      threads.set('odd', odd);
    });

    expect(store.getThreads().map((thread) => thread.comments[0]!.body)).toEqual(['Fine']);
  });
});

describe('who a comment names', () => {
  it('is kept with the comment, each person once', () => {
    const { store } = board();
    const id = store.addThread(onBoard(0, 0), ada, 'Over to @Grace', [grace, grace])!;
    store.addComment(id, grace, 'Thanks @Ada', [ada]);

    const [first, second] = store.getThreads()[0]!.comments;
    expect(first!.mentions).toEqual([grace]);
    expect(second!.mentions).toEqual([ada]);
  });

  it('follows the comment when it is edited', () => {
    const { store } = board();
    const id = store.addThread(onBoard(0, 0), ada, 'Over to @Grace', [grace])!;
    const comment = store.getThreads()[0]!.comments[0]!;

    store.editComment(id, comment.id, 'Never mind');
    expect(store.getThreads()[0]!.comments[0]!.mentions).toEqual([]);
  });

  it('reaches another client, and one that cannot be read is dropped', () => {
    const a = board();
    const id = a.store.addThread(onBoard(0, 0), ada, 'Over to @Grace', [grace])!;
    const comments = a.doc.getMap<Y.Map<unknown>>('comments').get(id)!.get('comments') as Y.Array<
      Y.Map<unknown>
    >;
    comments.get(0).set('mentions', [grace, { id: 7 }, 'nobody', { id: 'u-x', name: '' }]);

    const b = board();
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    expect(b.store.getThreads()[0]!.comments[0]!.mentions).toEqual([grace]);
  });
});

describe('reactions', () => {
  const start = () => {
    const made = board();
    const threadId = made.store.addThread(onBoard(0, 0), ada, 'Is this the final colour?')!;
    const commentId = made.store.getThreads()[0]!.comments[0]!.id;
    const given = () => made.store.getThreads()[0]!.comments[0]!.reactions;
    return { ...made, threadId, commentId, given };
  };

  it('are gathered by emoji, in the order each was first given', () => {
    const { store, threadId, commentId, given } = start();
    store.toggleReaction(threadId, commentId, grace, '🎉');
    store.toggleReaction(threadId, commentId, ada, '👍');
    store.toggleReaction(threadId, commentId, ada, '🎉');

    expect(given()).toEqual([
      { emoji: '🎉', by: [grace, ada] },
      { emoji: '👍', by: [ada] },
    ]);
  });

  it('are taken back by giving the same one again', () => {
    const { store, threadId, commentId, given } = start();
    store.toggleReaction(threadId, commentId, ada, '👍');
    store.toggleReaction(threadId, commentId, grace, '👍');
    store.toggleReaction(threadId, commentId, ada, '👍');

    expect(given()).toEqual([{ emoji: '👍', by: [grace] }]);
    store.toggleReaction(threadId, commentId, grace, '👍');
    expect(given()).toEqual([]);
  });

  it('from two people at once are both kept', () => {
    const a = start();
    const b = board();
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));

    a.store.toggleReaction(a.threadId, a.commentId, ada, '❤️');
    b.store.toggleReaction(a.threadId, a.commentId, grace, '❤️');
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));

    expect(a.given().map(({ emoji, by }) => [emoji, by.map((p) => p.id).sort()])).toEqual([
      ['❤️', ['u-ada', 'u-grace']],
    ]);
    expect(b.store.getThreads()[0]!.comments[0]!.reactions).toHaveLength(1);
  });

  it('are not written by a viewer, nor for something that is not an emoji', () => {
    const { store, threadId, commentId, given } = start();
    store.toggleReaction(threadId, commentId, ada, '   ');
    store.toggleReaction(threadId, commentId, ada, 'a:b');
    store.toggleReaction(threadId, commentId, ada, 'x'.repeat(40));
    expect(given()).toEqual([]);

    const viewer = board(new Y.Doc(), () => false);
    viewer.store.toggleReaction(threadId, commentId, ada, '👍');
    expect(viewer.store.getThreads()).toEqual([]);
  });

  it('go with the comment they were left on', () => {
    const { store, threadId, commentId } = start();
    store.addComment(threadId, grace, 'Not yet.');
    store.toggleReaction(threadId, commentId, grace, '👀');
    store.deleteComment(threadId, commentId);

    const left = store.getThreads()[0]!.comments;
    expect(left).toHaveLength(1);
    expect(left[0]!.reactions).toEqual([]);
  });
});

describe('pins on a flipped shape', () => {
  const onShape = (shapeId: string, x: number, y: number): CommentAnchor => ({
    shapeId,
    at: { x, y },
    point: { x: 10, y: 20 },
  });

  it('mirror their place on the shape, and the point they fall back to', () => {
    const { store } = board();
    store.addThread(onShape('photo', 0.2, 0.3), ada, 'The left eye');
    store.addThread(onShape('other', 0.2, 0.3), ada, 'Not flipped');
    store.addThread(onBoard(5, 5), ada, 'On the board');

    store.mirrorPins(new Set(['photo']), 'horizontal', { x: 100, y: 0 });
    const [photo, other, loose] = store.getThreads();
    expect(photo!.anchor).toEqual({
      shapeId: 'photo',
      at: { x: 0.8, y: 0.3 },
      point: { x: 190, y: 20 },
    });
    expect(other!.anchor).toEqual(onShape('other', 0.2, 0.3));
    expect(loose!.anchor).toEqual(onBoard(5, 5));

    store.mirrorPins(new Set(['photo']), 'vertical', { x: 0, y: 50 });
    expect(store.getThreads()[0]!.anchor).toEqual({
      shapeId: 'photo',
      at: { x: 0.8, y: 0.7 },
      point: { x: 190, y: 80 },
    });
  });

  it('stay out of undo when moved on their own, and are undone with a board edit that moves them', () => {
    const doc = new Y.Doc();
    const { store } = board(doc);
    const undo = new Y.UndoManager(doc.getArray('shapes'), {
      trackedOrigins: new Set([null, undefined, 'local']),
    });
    undo.addToScope(store.undoScope);
    store.addThread(onShape('photo', 0.2, 0.3), ada, 'The left eye');

    store.mirrorPins(new Set(['photo']), 'horizontal', { x: 100, y: 0 });
    expect(undo.undoStack).toHaveLength(0);

    doc.transact(
      () => store.mirrorPins(new Set(['photo']), 'horizontal', { x: 100, y: 0 }),
      'local',
    );
    expect(store.getThreads()[0]!.anchor.at.x).toBeCloseTo(0.2);
    undo.undo();
    expect(store.getThreads()[0]!.anchor.at.x).toBeCloseTo(0.8);
    undo.destroy();
  });
});
