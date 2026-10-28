import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createNote, type NoteShape } from '@canvasflow/canvas-engine';
import { NoteLikeStore, type NoteLikes } from './note-likes';
import { heartsOnScreen, likedBy } from './NoteLikeHearts';

const asha = { id: 'u-asha', name: 'Asha' };
const ravi = { id: 'u-ravi', name: 'Ravi' };

function board(doc = new Y.Doc(), canWrite = () => true) {
  let clock = 1000;
  return new NoteLikeStore(doc, canWrite, () => (clock += 1000));
}

/** Two copies of one board, each passing what it writes to the other. */
function twoScreens() {
  const one = new Y.Doc();
  const two = new Y.Doc();
  one.on('update', (update: Uint8Array) => Y.applyUpdate(two, update));
  two.on('update', (update: Uint8Array) => Y.applyUpdate(one, update));
  return [board(one), board(two)] as const;
}

describe('liking a note', () => {
  it('counts one like a person, newest first, and takes it back on a second press', () => {
    const store = board();
    store.toggle('n1', asha);
    store.toggle('n1', ravi);
    expect(store.getSnapshot().byNote.get('n1')).toEqual([
      { userId: 'u-ravi', name: 'Ravi', at: 3000 },
      { userId: 'u-asha', name: 'Asha', at: 2000 },
    ]);
    store.toggle('n1', ravi);
    expect(
      store
        .getSnapshot()
        .byNote.get('n1')
        ?.map((like) => like.userId),
    ).toEqual(['u-asha']);
    store.toggle('n1', asha);
    expect(store.getSnapshot().byNote.has('n1')).toBe(false);
  });

  it('lets one person like as many notes as they want', () => {
    const store = board();
    for (const id of ['n1', 'n2', 'n3']) store.toggle(id, asha);
    expect(store.getSnapshot().byNote.size).toBe(3);
  });

  it('keeps both likes when two people like the same note at once', () => {
    const one = new Y.Doc();
    const two = new Y.Doc();
    board(one).toggle('n1', asha);
    board(two).toggle('n1', ravi);
    Y.applyUpdate(one, Y.encodeStateAsUpdate(two));
    Y.applyUpdate(two, Y.encodeStateAsUpdate(one));
    expect(board(one).getSnapshot().byNote.get('n1')).toHaveLength(2);
    expect(board(two).getSnapshot().byNote.get('n1')).toHaveLength(2);
  });

  it('reaches everyone else on the board as it is given', () => {
    const [mine, theirs] = twoScreens();
    let heard = 0;
    theirs.subscribe(() => (heard += 1));
    mine.toggle('n1', asha);
    expect(heard).toBe(1);
    expect(theirs.getSnapshot().byNote.get('n1')?.[0]?.name).toBe('Asha');
  });

  it('writes nothing for someone who cannot edit the board', () => {
    const store = board(new Y.Doc(), () => false);
    expect(store.toggle('n1', asha)).toBe(false);
    expect(store.setHidden(true)).toBe(false);
    expect(store.getSnapshot()).toMatchObject({ hidden: false });
    expect(store.getSnapshot().byNote.size).toBe(0);
  });

  it('passes over what another client wrote wrong', () => {
    const doc = new Y.Doc();
    const raw = doc.getMap<unknown>('noteLikes');
    raw.set('a', 'nonsense');
    raw.set('b', { note: '', user: 'u' });
    raw.set('c', { note: 'n1', user: 'u-asha' });
    expect(board(doc).getSnapshot().byNote.get('n1')).toEqual([
      { userId: 'u-asha', name: '', at: 0 },
    ]);
  });

  it('hides likes for everyone, and shows them again', () => {
    const [mine, theirs] = twoScreens();
    mine.setHidden(true);
    expect(theirs.getSnapshot().hidden).toBe(true);
    mine.setHidden(false);
    expect(theirs.getSnapshot().hidden).toBe(false);
  });
});

describe('the hearts on screen', () => {
  const camera = { x: 0, y: 0, zoom: 1 };
  const screen = { width: 1000, height: 800 };
  const note = (id: string, extra: Partial<NoteShape> = {}): NoteShape => ({
    ...createNote({ id, x: 100, y: 100, seed: 1 }),
    ...extra,
  });
  const liked = (hidden = false): NoteLikes => ({
    byNote: new Map([['liked', [{ userId: 'u-ravi', name: 'Ravi', at: 1 }]]]),
    hidden,
  });

  it('gives an editor one on every note, counting the likes on each', () => {
    const hearts = heartsOnScreen(
      [note('plain'), note('liked')],
      camera,
      screen,
      liked(),
      'u-asha',
      true,
    );
    expect(hearts.map(({ noteId, count, mine }) => ({ noteId, count, mine }))).toEqual([
      { noteId: 'plain', count: null, mine: false },
      { noteId: 'liked', count: 1, mine: false },
    ]);
  });

  it('shows a viewer only the notes somebody likes', () => {
    const hearts = heartsOnScreen(
      [note('plain'), note('liked')],
      camera,
      screen,
      liked(),
      'u-v',
      false,
    );
    expect(hearts.map((heart) => heart.noteId)).toEqual(['liked']);
  });

  it('keeps counts and other people’s likes out of sight while hidden', () => {
    const editor = heartsOnScreen([note('liked')], camera, screen, liked(true), 'u-ravi', true);
    expect(editor).toMatchObject([{ count: null, mine: true, likes: [] }]);
    expect(heartsOnScreen([note('liked')], camera, screen, liked(true), 'u-v', false)).toEqual([]);
  });

  it('leaves out notes off screen or too small to press', () => {
    const far = note('far', { x: 5000 });
    expect(heartsOnScreen([far], camera, screen, liked(), 'u-asha', true)).toEqual([]);
    expect(
      heartsOnScreen([note('n')], { x: 0, y: 0, zoom: 0.4 }, screen, liked(), 'u-asha', true),
    ).toEqual([]);
  });

  it('names who liked a note, you first as yourself, and counts the rest past three', () => {
    const like = (userId: string, name: string) => ({ userId, name, at: 0 });
    expect(likedBy([like('u-asha', 'Asha'), like('u-ravi', 'Ravi')], 'u-asha')).toBe(
      'Liked by You and Ravi',
    );
    expect(
      likedBy(
        ['A', 'B', 'C', 'D', 'E'].map((name) => like(name, name)),
        null,
      ),
    ).toBe('Liked by A, B and 3 others');
  });
});
