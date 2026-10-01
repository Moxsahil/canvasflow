import { describe, expect, it, vi } from 'vitest';
import { BoardDocument } from '../src/document/document';
import { createRectangle } from '../src/shapes/rectangle';

const rect = (id: string) => createRectangle({ id, x: 0, y: 0, width: 10, height: 10 });

describe('BoardDocument.updateShapes', () => {
  it('updates several shapes atomically with attribution and stable order', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([rect('a'), rect('b')]);
    doc.setUserId('editor');
    const changed = vi.fn();
    doc.onChange(changed);
    doc.updateShapes([
      { id: 'b', patch: { x: 20 } },
      { id: 'a', patch: { x: 40 } },
    ]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(doc.getShapes().map(({ id, x, lastEditedBy }) => ({ id, x, lastEditedBy }))).toEqual([
      { id: 'a', x: 40, lastEditedBy: 'editor' },
      { id: 'b', x: 20, lastEditedBy: 'editor' },
    ]);
    doc.destroy();
  });

  it('ignores missing shapes, immutable identity fields and unchanged patches', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a'));
    const before = doc.getShapes();
    doc.setUserId('editor');
    const changed = vi.fn();
    doc.onChange(changed);
    doc.updateShapes([
      { id: 'missing', patch: { x: 20 } },
      { id: 'a', patch: { id: 'other', kind: 'ellipse', x: 0 } },
    ]);
    expect(changed).not.toHaveBeenCalled();
    expect(doc.getShapes()).toEqual(before);
    doc.destroy();
  });

  it('enforces read-only at the document boundary', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a'));
    const before = doc.getShapes();
    doc.setReadOnly(true);
    doc.updateShapes([{ id: 'a', patch: { x: 20 } }]);
    expect(doc.getShapes()).toEqual(before);
    doc.destroy();
  });

  it('commits geometry and ordered raises together and restores both in one undo', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([rect('member'), rect('frame'), rect('cover')]);
    const before = doc.getShapes();
    doc.setUserId('editor');
    const snapshots: Array<Array<{ id: string; x: number }>> = [];
    doc.onChange(() => snapshots.push(doc.getShapes().map(({ id, x }) => ({ id, x }))));
    const synced = vi.fn();
    doc.yDoc.on('update', synced);

    // The operation supplies its history boundaries, as flipSelection does.
    doc.breakUndoGroup();
    doc.updateShapes([{ id: 'member', patch: { x: 20, frameId: 'frame' } }], {
      bringToFront: ['frame', 'member'],
    });
    doc.breakUndoGroup();
    expect(snapshots).toEqual([
      [
        { id: 'cover', x: 0 },
        { id: 'frame', x: 0 },
        { id: 'member', x: 20 },
      ],
    ]);
    expect(synced).toHaveBeenCalledTimes(1);
    const after = doc.getShapes();
    expect(after.find((shape) => shape.id === 'member')).toMatchObject({
      frameId: 'frame',
      lastEditedBy: 'editor',
    });
    expect(after.find((shape) => shape.id === 'frame')).toMatchObject({ lastEditedBy: 'editor' });
    expect(after.find((shape) => shape.id === 'cover')?.lastEditedBy).toBeUndefined();

    doc.undo();
    expect(doc.getShapes()).toEqual(before);
    doc.redo();
    expect(doc.getShapes()).toEqual(after);
    doc.destroy();
  });

  it('can raise without geometry patches and keeps the last duplicate request order', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([rect('leaf'), rect('inner'), rect('outer'), rect('cover')]);
    const changed = vi.fn();
    doc.onChange(changed);
    // An inner frame and its leaf were encountered directly, then through the
    // outer frame. The final occurrence keeps every child above its parent.
    doc.updateShapes([], {
      bringToFront: ['inner', 'leaf', 'missing', 'outer', 'inner', 'leaf'],
    });
    expect(doc.getShapes().map((shape) => shape.id)).toEqual(['cover', 'outer', 'inner', 'leaf']);
    expect(changed).toHaveBeenCalledTimes(1);
    doc.destroy();
  });

  it('does not write for empty or missing-only raise requests', () => {
    const doc = new BoardDocument();
    doc.addShape(rect('a'));
    doc.setUserId('editor');
    const before = doc.getShapes();
    const history = doc.peekUndoItem();
    const changed = vi.fn();
    doc.onChange(changed);
    doc.updateShapes([], { bringToFront: [] });
    doc.updateShapes([], { bringToFront: ['missing'] });
    doc.updateShapes([{ id: 'a', patch: { x: 0 } }], { bringToFront: ['missing'] });
    expect(changed).not.toHaveBeenCalled();
    expect(doc.getShapes()).toEqual(before);
    expect(doc.peekUndoItem()).toBe(history);
    doc.destroy();
  });

  it('enforces read-only for raise-only batches too', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([rect('a'), rect('b')]);
    const before = doc.getShapes();
    const changed = vi.fn();
    doc.onChange(changed);
    doc.setReadOnly(true);
    doc.updateShapes([], { bringToFront: ['a'] });
    expect(doc.getShapes()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
    doc.destroy();
  });

  it('raises shapes above everything on a board past thirty-six shapes', () => {
    const doc = new BoardDocument();
    for (let i = 0; i < 60; i++) doc.addShape(rect(`s${i}`));
    doc.updateShapes([], { bringToFront: ['s3', 's4'] });
    expect(
      doc
        .getShapes()
        .map(({ id }) => id)
        .slice(-2),
    ).toEqual(['s3', 's4']);
    doc.destroy();
  });
});
