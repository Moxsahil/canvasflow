import { describe, it, expect } from 'vitest';
import { createFrame, createRectangle, type Shape } from '@canvasflow/canvas-engine';
import {
  assignmentsAfterMove,
  DEFAULT_DUPLICATE_OFFSET,
  duplicateOffsetFor,
  membersHiddenByTheirFrame,
  shapesCapturedBy,
  withFrameMembers,
} from './frame-ops';

function frame(id: string, x: number, y: number, width = 200, height = 100) {
  return createFrame({ id, x, y, width, height });
}

function rect(id: string, x: number, y: number, frameId?: string): Shape {
  const shape = createRectangle({ id, x, y, width: 20, height: 20 });
  return frameId ? { ...shape, frameId } : shape;
}

describe('withFrameMembers', () => {
  it('pulls in what is standing in a selected frame', () => {
    const shapes = [frame('f1', 0, 0), rect('a', 50, 50, 'f1'), rect('b', 900, 900)];

    expect(withFrameMembers(['f1'], shapes).sort()).toEqual(['a', 'f1']);
  });

  it('leaves a selection with no frame in it untouched', () => {
    const shapes = [frame('f1', 0, 0), rect('a', 50, 50, 'f1'), rect('b', 900, 900)];

    expect(withFrameMembers(['b'], shapes)).toEqual(['b']);
  });

  it('does not pull in a member selected on its own', () => {
    const shapes = [frame('f1', 0, 0), rect('a', 50, 50, 'f1'), rect('b', 60, 60, 'f1')];

    // Selecting one shape inside a frame is not selecting the frame.
    expect(withFrameMembers(['a'], shapes)).toEqual(['a']);
  });
});

describe('withFrameMembers, nested', () => {
  /** outer ⊃ inner ⊃ leaf */
  const outer = frame('outer', 0, 0, 400, 400);
  const inner = { ...frame('inner', 20, 20, 200, 200), frameId: 'outer' };
  const leaf = rect('leaf', 40, 40, 'inner');
  const shapes = [outer, inner, leaf];

  it('reaches the contents of an inner frame', () => {
    // Taking only the outer's direct members would move the inner frame while
    // leaving what it holds behind, sitting where the frame used to be.
    expect(withFrameMembers(['outer'], shapes).sort()).toEqual(['inner', 'leaf', 'outer']);
  });

  it('takes only the subtree when the inner frame is the one selected', () => {
    expect(withFrameMembers(['inner'], shapes).sort()).toEqual(['inner', 'leaf']);
  });
});

describe('membersHiddenByTheirFrame, nested', () => {
  it('raises a frame and then what it holds, in that order', () => {
    // z-order is array order: the outer frame is painted last, so it covers
    // the inner frame, which in turn would cover its own leaf once raised.
    const inner = { ...frame('inner', 20, 20, 200, 200), frameId: 'outer' };
    const leaf = rect('leaf', 40, 40, 'inner');
    const outer = frame('outer', 0, 0, 400, 400);

    // Deepest last: each id is brought to the front in turn, so the leaf has
    // to be raised after the frame holding it or it lands underneath.
    expect(membersHiddenByTheirFrame([inner, leaf, outer])).toEqual(['inner', 'leaf']);
  });
});

describe('duplicateOffsetFor', () => {
  it('puts a frame copy beside the original, on one axis', () => {
    const shapes = [frame('f1', 0, 0, 200, 100)];

    // The whole width plus a gap, and no vertical drift — so repeating the
    // gesture lays copies out in a row instead of a pile.
    const offset = duplicateOffsetFor(['f1'], shapes);
    expect(offset.dy).toBe(0);
    expect(offset.dx).toBeGreaterThan(200);
  });

  it('clears the contents too, not just the frame', () => {
    // The member overhangs to x=320, well past the frame's right edge at 200.
    // Measuring the frame alone would drop the copy straight onto it.
    const shapes = [frame('f1', 0, 0, 200, 100), rect('a', 300, 40, 'f1')];

    expect(duplicateOffsetFor(['f1'], shapes).dx).toBeGreaterThan(320);
  });

  it('leaves every other kind of shape on the old offset', () => {
    const shapes = [rect('a', 0, 0)];

    expect(duplicateOffsetFor(['a'], shapes)).toEqual(DEFAULT_DUPLICATE_OFFSET);
  });
});

describe('assignmentsAfterMove', () => {
  it('takes in a shape dragged into a frame', () => {
    const shapes = [frame('f1', 0, 0), rect('a', 50, 40)];

    expect(assignmentsAfterMove(['a'], shapes)).toEqual([{ id: 'a', frameId: 'f1' }]);
  });

  it('releases a shape dragged out', () => {
    const shapes = [frame('f1', 0, 0), rect('a', 900, 900, 'f1')];

    expect(assignmentsAfterMove(['a'], shapes)).toEqual([{ id: 'a', frameId: null }]);
  });

  it('leaves the contents alone when the frame itself was dragged', () => {
    // The members moved with it, so nothing about who is inside changed —
    // and recomputing would be wasted writes on a shared board.
    const shapes = [frame('f1', 500, 500), rect('a', 550, 540, 'f1')];

    expect(assignmentsAfterMove(['f1', 'a'], shapes)).toEqual([]);
  });

  it('does not adopt a shape a frame was merely dragged over', () => {
    // Membership follows the thing that moved. A container passing across
    // something must not quietly swallow it.
    const shapes = [frame('f1', 0, 0), rect('bystander', 50, 40)];

    expect(assignmentsAfterMove(['f1'], shapes)).toEqual([]);
  });

  it('says nothing when a shape moves within its own frame', () => {
    const shapes = [frame('f1', 0, 0), rect('a', 60, 50, 'f1')];

    expect(assignmentsAfterMove(['a'], shapes)).toEqual([]);
  });
});

describe('shapesCapturedBy', () => {
  it('takes in the loose shapes a new frame was drawn around', () => {
    const f = frame('f1', 0, 0);
    const shapes = [rect('inside', 50, 40), rect('outside', 900, 900), f];

    expect(shapesCapturedBy(f, shapes)).toEqual(['inside']);
  });

  it('takes in a whole frame, without emptying it', () => {
    const existing = frame('existing', 0, 0);
    const drawn = frame('drawn', 0, 0, 400, 400);
    const shapes = [existing, rect('spoken-for', 50, 40, 'existing'), drawn];

    // Drawing a box around an existing frame is how you say it belongs in
    // there. It nests whole: the shape standing in it stays its own, rather
    // than being claimed a second time by the frame now holding both.
    expect(shapesCapturedBy(drawn, shapes)).toEqual(['existing']);
  });

  it('never captures itself', () => {
    const drawn = frame('drawn', 0, 0, 400, 400);

    // The frame is inside its own bounds by definition, so nothing but the
    // loop check keeps it off its own list.
    expect(shapesCapturedBy(drawn, [drawn])).toEqual([]);
  });
});

describe('membersHiddenByTheirFrame', () => {
  it('finds a member sitting below its own frame', () => {
    // z-order is array order, so this member is painted before the frame and
    // its border and fill land on top of it.
    const shapes = [rect('a', 50, 40, 'f1'), frame('f1', 0, 0)];

    expect(membersHiddenByTheirFrame(shapes)).toEqual(['a']);
  });

  it('leaves a member already above its frame alone', () => {
    const shapes = [frame('f1', 0, 0), rect('a', 50, 40, 'f1')];

    expect(membersHiddenByTheirFrame(shapes)).toEqual([]);
  });

  it('ignores a member whose frame has been deleted', () => {
    const shapes = [rect('orphan', 50, 40, 'gone')];

    expect(membersHiddenByTheirFrame(shapes)).toEqual([]);
  });
});
