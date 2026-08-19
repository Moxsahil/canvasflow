import { describe, expect, it } from 'vitest';
import { BoardDocument } from '../src/document/document';
import { createRectangle } from '../src/shapes/rectangle';

const rect = (id: string, x: number) =>
  createRectangle({ id, x, y: 0, width: 10, height: 10, seed: 1 });

describe('BoardDocument.replaceShapes', () => {
  it('swaps the contents of the board', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a', 0));
    doc.addShape(rect('b', 10));

    doc.replaceShapes([rect('c', 20)]);

    expect(doc.getShapes().map((s) => s.id)).toEqual(['c']);
  });

  it('keeps the file order of the shapes it was given', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([rect('c', 0), rect('a', 10), rect('b', 20)]);
    expect(doc.getShapes().map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('undoes back to the shapes that were there before', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a', 0));
    doc.addShape(rect('b', 10));
    doc.breakUndoGroup();

    doc.replaceShapes([rect('c', 20)]);
    doc.breakUndoGroup();

    doc.undo();

    expect(doc.getShapes().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('hands out an undo handle that only matches its own edit', () => {
    // The editor pairs the camera with the edit that moved it, and identifies
    // that edit by this handle — so a later edit must never match it.
    const doc = new BoardDocument();
    doc.replaceShapes([rect('c', 20)]);
    doc.breakUndoGroup();
    const openEdit = doc.peekUndoItem();
    expect(openEdit).not.toBeNull();

    doc.addShape(rect('d', 30));
    doc.breakUndoGroup();
    expect(doc.peekUndoItem()).not.toBe(openEdit);

    // Undoing the later edit brings the open back to the top, unchanged.
    doc.undo();
    expect(doc.peekUndoItem()).toBe(openEdit);
  });

  it('redoes back to the opened file', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a', 0));
    doc.breakUndoGroup();
    doc.replaceShapes([rect('c', 20)]);
    doc.breakUndoGroup();

    doc.undo();
    doc.redo();

    expect(doc.getShapes().map((s) => s.id)).toEqual(['c']);
  });
});
