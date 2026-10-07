import { describe, expect, it } from 'vitest';
import { BoardDocument } from '../src/document/document';
import { createArrow } from '../src/shapes/arrow';
import { createRectangle } from '../src/shapes/rectangle';
import type { ArrowShape } from '../src/shapes/shape';

const box = createRectangle({ id: 'box', x: 200, y: 0, width: 100, height: 100 });
const arrow = createArrow({
  id: 'arrow',
  x: 0,
  y: 50,
  points: [
    [0, 0],
    [198, 0],
  ],
  endBinding: { shapeId: 'box', anchor: { x: 0.5, y: 0.5 }, precise: false },
});
const pin = {
  id: 'arrow',
  startBinding: null,
  endBinding: { shapeId: 'box', anchor: { x: 0, y: 0.5 }, precise: true },
};

const arrowIn = (doc: BoardDocument) =>
  doc.getShapes().find((shape) => shape.id === 'arrow') as ArrowShape;

describe('BoardDocument.pinArrowBindings', () => {
  it('fixes the binding without it being an edit anyone can undo or is named on', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([box, arrow]);
    doc.breakUndoGroup();
    doc.setUserId('editor');
    doc.updateShape('box', { y: 10 });
    doc.breakUndoGroup();

    doc.pinArrowBindings([pin]);
    expect(arrowIn(doc).endBinding).toEqual(pin.endBinding);
    expect(arrowIn(doc).lastEditedBy).toBeUndefined();

    // Undo takes back the edit before it, and leaves the pin alone.
    doc.undo();
    expect(doc.getShapes().find((shape) => shape.id === 'box')!.y).toBe(0);
    expect(arrowIn(doc).endBinding).toEqual(pin.endBinding);
    doc.destroy();
  });

  it('writes nothing for a viewer', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([box, arrow]);
    doc.setReadOnly(true);
    doc.pinArrowBindings([pin]);
    expect(arrowIn(doc).endBinding!.precise).toBe(false);
    doc.destroy();
  });
});
