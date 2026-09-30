import { describe, expect, it } from 'vitest';
import { SpatialIndex, createFrame, createRectangle, type Shape } from '@canvasflow/canvas-engine';
import {
  anchorAt,
  anchorPoint,
  canDeleteThread,
  canEditComment,
  cleanCommentBody,
  commentTargetAt,
  isCommentEmpty,
  type CommentThread,
} from './comment-model';
import { relativeTime } from './comment-time';
import { isPinInView, isPinOnBoard, panelPlacement, peekPlacement } from './comment-placement';

const rect = (id: string, x: number, y: number, width = 100, height = 50): Shape =>
  createRectangle({ id, x, y, width, height });
const byId = (...shapes: Shape[]) => new Map(shapes.map((shape) => [shape.id, shape]));

function target(point: { x: number; y: number }, shapes: Shape[]) {
  const index = new SpatialIndex();
  index.rebuild(shapes);
  return commentTargetAt(point, shapes, index, 1);
}

describe('anchors', () => {
  it('pins to a spot on a shape as a fraction of its box', () => {
    const anchor = anchorAt({ x: 125, y: 40 }, rect('a', 100, 20));

    expect(anchor).toEqual({ shapeId: 'a', at: { x: 0.25, y: 0.4 }, point: { x: 125, y: 40 } });
  });

  it('pins to the board where there is no shape', () => {
    expect(anchorAt({ x: 7, y: 9 }, null)).toMatchObject({ shapeId: null, point: { x: 7, y: 9 } });
  });

  it('keeps its spot on a shape that is moved and resized', () => {
    const anchor = anchorAt({ x: 125, y: 40 }, rect('a', 100, 20));

    expect(anchorPoint(anchor, byId(rect('a', 500, 300, 200, 100)))).toEqual({ x: 550, y: 340 });
  });

  it('stands at its own point once the shape has gone, and back on it when it returns', () => {
    const anchor = anchorAt({ x: 125, y: 40 }, rect('a', 100, 20));

    expect(anchorPoint(anchor, byId())).toEqual({ x: 125, y: 40 });
    expect(anchorPoint(anchor, byId(rect('a', 0, 0)))).toEqual({ x: 25, y: 20 });
  });
});

describe('commentTargetAt', () => {
  it('takes the shape on top at the point', () => {
    const shapes = [rect('under', 0, 0, 200, 200), rect('over', 50, 50)];

    expect(target({ x: 60, y: 60 }, shapes)?.id).toBe('over');
    expect(target({ x: 10, y: 10 }, shapes)?.id).toBe('under');
  });

  it('takes a frame from anywhere inside it, though a click there selects nothing', () => {
    const shapes = [createFrame({ id: 'f', x: 0, y: 0, width: 400, height: 300 })];

    expect(target({ x: 200, y: 150 }, shapes)?.id).toBe('f');
  });

  it('prefers what is standing in a frame to the frame', () => {
    const shapes = [
      createFrame({ id: 'f', x: 0, y: 0, width: 400, height: 300 }),
      rect('a', 50, 50),
    ];

    expect(target({ x: 60, y: 60 }, shapes)?.id).toBe('a');
  });

  it('is nothing on empty board', () => {
    expect(target({ x: 900, y: 900 }, [rect('a', 0, 0)])).toBeNull();
  });
});

describe('who may change what', () => {
  const thread = {
    createdBy: 'ada',
    comments: [{ authorId: 'ada' }, { authorId: 'grace' }],
  } as unknown as CommentThread;

  it('lets an author edit their own comment and nobody else’s', () => {
    expect(canEditComment(thread.comments[0]!, 'ada')).toBe(true);
    expect(canEditComment(thread.comments[1]!, 'ada')).toBe(false);
    expect(canEditComment(thread.comments[0]!, null)).toBe(false);
  });

  it('lets whoever started a thread delete it', () => {
    expect(canDeleteThread(thread, 'ada')).toBe(true);
    expect(canDeleteThread(thread, 'grace')).toBe(false);
  });
});

describe('comment bodies', () => {
  it('counts space alone as nothing', () => {
    expect(isCommentEmpty(' \n\t ')).toBe(true);
    expect(isCommentEmpty(' x ')).toBe(false);
  });

  it('keeps the lines and drops the space around them', () => {
    expect(cleanCommentBody('  one\r\ntwo  \n')).toBe('one\ntwo');
  });
});

describe('relativeTime', () => {
  const now = Date.UTC(2026, 8, 30, 12, 0, 0);
  const ago = (ms: number) => relativeTime(now - ms, now);

  it('says "now" for anything under a minute', () => {
    expect(ago(0)).toBe('now');
    expect(ago(59_000)).toBe('now');
  });

  it('counts up through minutes, hours and days', () => {
    expect(ago(5 * 60_000)).toBe('5m ago');
    expect(ago(3 * 3_600_000)).toBe('3h ago');
    expect(ago(24 * 3_600_000)).toBe('yesterday');
    expect(ago(4 * 24 * 3_600_000)).toBe('4d ago');
  });
});

describe('panelPlacement', () => {
  const board = { width: 1000, height: 600 };
  const panel = { width: 300, height: 200 };

  it('opens to the right of the pin, level with its top', () => {
    expect(panelPlacement({ x: 100, y: 300 }, panel, board)).toEqual({ left: 138, top: 272 });
  });

  it('opens to the left when the right has no room', () => {
    expect(panelPlacement({ x: 900, y: 300 }, panel, board).left).toBe(590);
  });

  it('stays on the board at its top and bottom edges', () => {
    expect(panelPlacement({ x: 100, y: 10 }, panel, board).top).toBe(8);
    expect(panelPlacement({ x: 100, y: 590 }, panel, board).top).toBe(392);
  });
});

describe('peekPlacement', () => {
  const board = { width: 1000, height: 600 };
  const card = { width: 214, height: 60 };

  it('stands beside the pin, rising from the point the pin stands on', () => {
    expect(peekPlacement({ x: 100, y: 300 }, card, board)).toEqual({ left: 134, top: 240 });
  });

  it('goes to the left when the right has no room', () => {
    expect(peekPlacement({ x: 900, y: 300 }, card, board).left).toBe(680);
  });

  it('stays on the board under a pin at its top edge', () => {
    expect(peekPlacement({ x: 100, y: 20 }, card, board).top).toBe(8);
  });
});

describe('isPinInView', () => {
  const board = { width: 1000, height: 600 };

  it('holds for a pin standing anywhere on the open board', () => {
    expect(isPinInView({ x: 500, y: 300 }, board)).toBe(true);
    expect(isPinInView({ x: 16, y: 92 }, board)).toBe(true);
    expect(isPinInView({ x: 956, y: 528 }, board)).toBe(true);
  });

  it('does not for one off the board, or cut by its edge', () => {
    expect(isPinInView({ x: -40, y: 300 }, board)).toBe(false);
    expect(isPinInView({ x: 980, y: 300 }, board)).toBe(false);
    expect(isPinInView({ x: 500, y: 900 }, board)).toBe(false);
  });

  it('does not for one under the buttons along the top or the toolbar along the bottom', () => {
    expect(isPinInView({ x: 500, y: 50 }, board)).toBe(false);
    expect(isPinInView({ x: 500, y: 580 }, board)).toBe(false);
  });
});

describe('isPinOnBoard', () => {
  it('keeps a pin just off the edge, and drops one far from it', () => {
    const board = { width: 1000, height: 600 };

    expect(isPinOnBoard({ x: -50, y: 300 }, board)).toBe(true);
    expect(isPinOnBoard({ x: -500, y: 300 }, board)).toBe(false);
  });
});
