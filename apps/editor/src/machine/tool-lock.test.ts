import { describe, expect, it } from 'vitest';
import { createActor, type Actor } from 'xstate';
import { toolMachine } from './tool-machine';
import type { Tool } from '@/tools/tool';

function startWith(tool: Tool, locked: boolean) {
  const actor = createActor(toolMachine).start();
  actor.send({ type: 'SET_TOOL_LOCK', locked });
  actor.send({ type: 'SELECT_TOOL', tool });
  return actor;
}

/** Press, drag far enough to count as a gesture, release. */
function drag(actor: Actor<typeof toolMachine>) {
  actor.send({
    type: 'POINTER_DOWN',
    point: { x: 10, y: 10 },
    button: 0,
    shiftKey: false,
    hitShapeId: null,
    hitHandle: null,
    hitVertex: null,
  });
  actor.send({ type: 'POINTER_MOVE', point: { x: 90, y: 70 }, screenDelta: { x: 0, y: 0 } });
  actor.send({ type: 'POINTER_UP', point: { x: 90, y: 70 } });
}

const SHAPE_TOOLS: Tool[] = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'frame'];

describe('tool lock, off', () => {
  it('hands the board back to select once a shape is drawn', () => {
    for (const tool of SHAPE_TOOLS) {
      const actor = startWith(tool, false);
      drag(actor);
      expect(actor.getSnapshot().context.activeTool).toBe('select');
    }
  });

  it('leaves the drawn shape selected, so it can be acted on at once', () => {
    const actor = startWith('rectangle', false);
    const ids: string[] = [];
    actor.on('shape.committed', (event) => ids.push(event.shape.id));

    drag(actor);

    expect(ids).toHaveLength(1);
    expect(actor.getSnapshot().context.selectedIds).toEqual(ids);
  });

  it('selects the shape rather than whatever was selected before', () => {
    const actor = startWith('rectangle', false);
    actor.send({ type: 'SELECT_ALL', shapeIds: ['old-1', 'old-2'] });

    drag(actor);

    expect(actor.getSnapshot().context.selectedIds).not.toContain('old-1');
    expect(actor.getSnapshot().context.selectedIds).toHaveLength(1);
  });

  it('keeps the tool when the gesture was too small to make anything', () => {
    // A click with no drag commits nothing, so there is nothing to hand over
    // and no reason to take the tool away.
    const actor = startWith('rectangle', false);
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 10, y: 10 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
      hitVertex: null,
    });
    actor.send({ type: 'POINTER_UP', point: { x: 10, y: 10 } });

    expect(actor.getSnapshot().context.activeTool).toBe('rectangle');
    expect(actor.getSnapshot().context.selectedIds).toEqual([]);
  });

  it('returns to select after committing new text, holding it selected', () => {
    const actor = startWith('text', false);
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 20, y: 20 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
      hitVertex: null,
    });
    actor.send({ type: 'COMMIT_TEXT', text: 'hello', shapeId: 'text-1' });

    expect(actor.getSnapshot().context.activeTool).toBe('select');
    expect(actor.getSnapshot().context.selectedIds).toEqual(['text-1']);
  });

  it('keeps the text tool when the text box was abandoned', () => {
    const actor = startWith('text', false);
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 20, y: 20 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
      hitVertex: null,
    });
    actor.send({ type: 'CANCEL_TEXT' });

    expect(actor.getSnapshot().context.activeTool).toBe('text');
  });
});

describe('tool lock, on', () => {
  it('keeps the tool after a shape, ready for the next one', () => {
    for (const tool of SHAPE_TOOLS) {
      const actor = startWith(tool, true);
      drag(actor);
      expect(actor.getSnapshot().context.activeTool).toBe(tool);
    }
  });

  it('leaves the drawn shape unselected', () => {
    // Handles over the shape you just made sit in the way of the next one, and
    // put a stray Delete on the wrong target.
    const actor = startWith('rectangle', true);
    drag(actor);
    expect(actor.getSnapshot().context.selectedIds).toEqual([]);
  });

  it('still commits the shape', () => {
    const actor = startWith('rectangle', true);
    const ids: string[] = [];
    actor.on('shape.committed', (event) => ids.push(event.shape.id));

    drag(actor);

    expect(ids).toHaveLength(1);
  });

  it('draws a run of shapes without ever touching the toolbar', () => {
    const actor = startWith('diamond', true);
    const ids: string[] = [];
    actor.on('shape.committed', (event) => ids.push(event.shape.id));

    drag(actor);
    drag(actor);
    drag(actor);

    expect(ids).toHaveLength(3);
    expect(actor.getSnapshot().context.activeTool).toBe('diamond');
  });

  it('keeps the text tool after committing text, and selects nothing', () => {
    const actor = startWith('text', true);
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 20, y: 20 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
      hitVertex: null,
    });
    actor.send({ type: 'COMMIT_TEXT', text: 'hello', shapeId: 'text-1' });

    expect(actor.getSnapshot().context.activeTool).toBe('text');
    expect(actor.getSnapshot().context.selectedIds).toEqual([]);
  });
});

describe('tools the lock does not govern', () => {
  it('keeps the pencil whether the lock is on or off, selecting nothing', () => {
    // Both tools exempt here are reached for to draw a run rather than one
    // thing, so they behave the same way on either setting. The sketch tool's
    // own suite covers it; this is the pencil.
    for (const locked of [true, false]) {
      const actor = startWith('freehand', locked);
      actor.send({
        type: 'POINTER_DOWN',
        point: { x: 0, y: 0 },
        button: 0,
        shiftKey: false,
        hitShapeId: null,
        hitHandle: null,
        hitVertex: null,
      });
      for (let i = 1; i <= 6; i++) {
        actor.send({
          type: 'POINTER_MOVE',
          point: { x: i * 6, y: i * 4 },
          screenDelta: { x: 0, y: 0 },
        });
      }
      actor.send({ type: 'POINTER_UP', point: { x: 36, y: 24 } });

      expect(actor.getSnapshot().context.activeTool).toBe('freehand');
      expect(actor.getSnapshot().context.selectedIds).toEqual([]);
    }
  });

  it('leaves editing an existing text shape alone', () => {
    // Reached from the select tool by double-clicking, so there is no tool to
    // hand back and no new shape to hold.
    const actor = startWith('select', false);
    actor.send({
      type: 'EDIT_TEXT_SHAPE',
      shapeId: 'text-9',
      position: { x: 5, y: 5 },
      existingText: 'before',
    });
    actor.send({ type: 'COMMIT_TEXT', text: 'after' });

    expect(actor.getSnapshot().context.activeTool).toBe('select');
    expect(actor.getSnapshot().context.selectedIds).toEqual([]);
  });
});

describe('the lock itself', () => {
  it('starts off, so a tool hands back until asked not to', () => {
    expect(createActor(toolMachine).start().getSnapshot().context.toolLocked).toBe(false);
  });

  it('takes effect on the shapes drawn after it changes, not before', () => {
    const actor = startWith('rectangle', true);
    drag(actor);
    expect(actor.getSnapshot().context.activeTool).toBe('rectangle');

    actor.send({ type: 'SET_TOOL_LOCK', locked: false });
    drag(actor);
    expect(actor.getSnapshot().context.activeTool).toBe('select');
  });

  it('survives a tool change, being a preference rather than tool state', () => {
    const actor = startWith('rectangle', true);
    actor.send({ type: 'SELECT_TOOL', tool: 'ellipse' });
    expect(actor.getSnapshot().context.toolLocked).toBe(true);
  });
});
