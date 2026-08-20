import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardDocument } from '../src/document/document.js';
import { createRectangle } from '../src/shapes/index.js';

function rect(id: string) {
  return createRectangle({ id, x: 0, y: 0, width: 10, height: 10 });
}

describe('BoardDocument read-only', () => {
  it('refuses every local mutation', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a'));
    doc.addShape(rect('b'));
    doc.setReadOnly(true);

    const before = doc.getShapes();

    doc.addShape(rect('c'));
    doc.updateShape('a', { x: 999 });
    doc.deleteShapes(['a']);
    doc.nudgeShapes(['a'], 5, 5);
    doc.bringToFront('a');
    doc.sendToBack('a');
    doc.bringForward('a');
    doc.sendBackward('a');
    doc.replaceShapes([rect('z')]);
    const duplicated = doc.duplicateShapes(['a'], { dx: 1, dy: 1 }, () => 'dup');

    expect(duplicated).toEqual([]);
    expect(doc.getShapes()).toEqual(before);

    doc.destroy();
  });

  it('refuses undo and redo', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a'));
    doc.breakUndoGroup();
    doc.addShape(rect('b'));

    const before = doc.getShapes();
    doc.setReadOnly(true);
    doc.undo();

    expect(doc.getShapes()).toEqual(before);
    doc.destroy();
  });

  it('still accepts remote updates', () => {
    // The point of the guard is to stop *local* edits diverging from a server
    // that rejects them — a viewer must still receive everyone else's work.
    const author = new BoardDocument();
    author.addShape(rect('remote'));

    const viewer = new BoardDocument();
    viewer.setReadOnly(true);
    viewer.applyUpdate(Y.encodeStateAsUpdate(author.yDoc));

    expect(viewer.getShapes().map((s) => s.id)).toEqual(['remote']);

    author.destroy();
    viewer.destroy();
  });

  it('resumes accepting edits when read-only is lifted', () => {
    const doc = new BoardDocument();
    doc.setReadOnly(true);
    doc.addShape(rect('blocked'));
    expect(doc.getShapes()).toHaveLength(0);

    doc.setReadOnly(false);
    doc.addShape(rect('allowed'));
    expect(doc.getShapes().map((s) => s.id)).toEqual(['allowed']);

    doc.destroy();
  });
});
