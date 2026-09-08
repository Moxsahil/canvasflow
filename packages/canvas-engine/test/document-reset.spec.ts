import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardDocument } from '../src/document/document';
import { createRectangle } from '../src/shapes/rectangle';

const rect = (id: string, x: number) =>
  createRectangle({ id, x, y: 0, width: 10, height: 10, seed: 1 });

/** Hand everything one document knows to the other, as the provider would. */
const sync = (from: BoardDocument, to: BoardDocument) =>
  Y.applyUpdate(to.yDoc, Y.encodeStateAsUpdate(from.yDoc), 'provider');

const ids = (doc: BoardDocument) => doc.getShapes().map((shape) => shape.id);

/**
 * Resetting the canvas is `replaceShapes([])` — the same transaction the open
 * flow uses, given nothing to put back. These cover what the empty case has to
 * get right; read-only refusal is covered with the other mutations in
 * read-only.spec.ts.
 */
describe('resetting the canvas', () => {
  it('clears every shape', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a', 0));
    doc.addShape(rect('b', 10));

    doc.replaceShapes([]);

    expect(doc.getShapes()).toEqual([]);
  });

  it('is a single undo step that brings the whole board back', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a', 0));
    doc.addShape(rect('b', 10));
    doc.addShape(rect('c', 20));
    doc.breakUndoGroup();

    doc.replaceShapes([]);
    doc.breakUndoGroup();

    doc.undo();

    // One undo, not three: the whole reset is one transaction.
    expect(ids(doc)).toEqual(['a', 'b', 'c']);
  });

  it('redoes back to the empty board', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a', 0));
    doc.breakUndoGroup();
    doc.replaceShapes([]);
    doc.breakUndoGroup();

    doc.undo();
    doc.redo();

    expect(doc.getShapes()).toEqual([]);
  });

  it('keeps the shapes in their original order when undone', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a', 0));
    doc.addShape(rect('b', 10));
    doc.addShape(rect('c', 20));
    doc.breakUndoGroup();
    doc.replaceShapes([]);
    doc.breakUndoGroup();

    doc.undo();

    // Stacking order survives the round trip, so an undone reset puts the
    // board back as it was rather than merely restoring its contents.
    expect(ids(doc)).toEqual(['a', 'b', 'c']);
  });

  it('hands out an undo handle for the editor to pair the camera with', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a', 0));
    doc.breakUndoGroup();

    doc.replaceShapes([]);
    doc.breakUndoGroup();
    const resetEdit = doc.peekUndoItem();

    expect(resetEdit).not.toBeNull();

    doc.addShape(rect('b', 10));
    doc.breakUndoGroup();
    expect(doc.peekUndoItem()).not.toBe(resetEdit);
  });

  it('adds no undo step when the board was already empty', () => {
    const doc = new BoardDocument();

    doc.replaceShapes([]);

    // Nothing changed, so there is nothing to undo — a reset on an empty
    // board must not consume the ⌘Z that was going to revert something else.
    expect(doc.canUndo()).toBe(false);
  });

  it('leaves the previous edit on top of the undo stack when the board was already empty', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a', 0));
    doc.breakUndoGroup();
    doc.deleteShapes(['a']);
    doc.breakUndoGroup();
    const previous = doc.peekUndoItem();

    doc.replaceShapes([]);

    // The editor pairs the camera with the edit it has just made, identifying
    // it by this handle. An empty reset makes no edit, so it must not appear
    // to own the one before it — or undoing that earlier edit would drag the
    // viewport along with it.
    expect(doc.peekUndoItem()).toBe(previous);
  });

  it('clears the board for everyone in the room', () => {
    const author = new BoardDocument();
    const peer = new BoardDocument();
    author.addShape(rect('a', 0));
    author.addShape(rect('b', 10));
    sync(author, peer);
    expect(ids(peer)).toEqual(['a', 'b']);

    author.replaceShapes([]);
    sync(author, peer);

    expect(peer.getShapes()).toEqual([]);
  });

  it('keeps what someone else drew while the reset was in flight', () => {
    // The case tombstoning exists to solve elsewhere: a delete has to stick
    // rather than being undone by a peer's copy of the shape. Yjs settles it
    // as causality — the reset removes what it could see, and a drawing made
    // concurrently is not something it could see, so that one survives.
    const author = new BoardDocument();
    const peer = new BoardDocument();
    author.addShape(rect('a', 0));
    author.addShape(rect('b', 10));
    sync(author, peer);

    author.replaceShapes([]);
    peer.addShape(rect('c', 20));

    sync(author, peer);
    sync(peer, author);

    expect(ids(author)).toEqual(['c']);
    expect(ids(peer)).toEqual(['c']);
  });

  it('leaves an undone reset agreed on by both sides', () => {
    const author = new BoardDocument();
    const peer = new BoardDocument();
    author.addShape(rect('a', 0));
    author.breakUndoGroup();
    sync(author, peer);

    author.replaceShapes([]);
    author.breakUndoGroup();
    sync(author, peer);

    author.undo();
    sync(author, peer);

    expect(ids(peer)).toEqual(['a']);
  });
});
