import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { toolMachine } from './tool-machine';
import type { Tool } from '@/tools/tool';

function startWith(tool: Tool, locked = false) {
  const actor = createActor(toolMachine).start();
  actor.send({ type: 'SET_TOOL_LOCK', locked });
  actor.send({ type: 'SELECT_TOOL', tool });
  return actor;
}

describe('starting text with a double press', () => {
  it('opens an empty box at the point pressed', () => {
    const actor = startWith('select');
    actor.send({ type: 'START_TEXT_AT', point: { x: 40, y: 25 } });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('editingText')).toBe(true);
    expect(snapshot.context.textEditingAt).toEqual({ x: 40, y: 25 });
    // No shape behind it: this is text being made, not text being reopened.
    expect(snapshot.context.editingTextShapeId).toBeNull();
  });

  it('leaves the new text selected, the way a shape just drawn is', () => {
    const actor = startWith('select');
    actor.send({ type: 'START_TEXT_AT', point: { x: 40, y: 25 } });
    actor.send({ type: 'COMMIT_TEXT', text: 'hello', shapeId: 'text-1' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('idle')).toBe(true);
    expect(snapshot.context.selectedIds).toEqual(['text-1']);
    expect(snapshot.context.activeTool).toBe('select');
    expect(snapshot.context.textEditingAt).toBeNull();
  });

  it('lets go of whatever the press underneath had selected', () => {
    const actor = startWith('select');
    actor.send({ type: 'SELECT_ALL', shapeIds: ['rect-1'] });
    actor.send({ type: 'START_TEXT_AT', point: { x: 40, y: 25 } });

    expect(actor.getSnapshot().context.selectedIds).toEqual([]);
  });

  it('selects nothing when the box was left empty', () => {
    const actor = startWith('select');
    actor.send({ type: 'START_TEXT_AT', point: { x: 40, y: 25 } });
    // No shapeId: the Editor made nothing, so there is nothing to hold.
    actor.send({ type: 'COMMIT_TEXT', text: '   ' });

    expect(actor.getSnapshot().context.selectedIds).toEqual([]);
  });

  it('puts the board back where it was when the box is abandoned', () => {
    const actor = startWith('select');
    actor.send({ type: 'START_TEXT_AT', point: { x: 40, y: 25 } });
    actor.send({ type: 'CANCEL_TEXT' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('idle')).toBe(true);
    expect(snapshot.context.textEditingAt).toBeNull();
  });

  it('moves to the new point when a second double press lands elsewhere', () => {
    const actor = startWith('select');
    actor.send({ type: 'START_TEXT_AT', point: { x: 40, y: 25 } });
    actor.send({ type: 'START_TEXT_AT', point: { x: 300, y: 80 } });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('editingText')).toBe(true);
    expect(snapshot.context.textEditingAt).toEqual({ x: 300, y: 80 });
  });

  it('reopens existing text without disturbing what is selected', () => {
    const actor = startWith('select');
    actor.send({ type: 'SELECT_ALL', shapeIds: ['text-9'] });
    actor.send({
      type: 'EDIT_TEXT_SHAPE',
      shapeId: 'text-9',
      position: { x: 5, y: 5 },
      existingText: 'before',
    });
    expect(actor.getSnapshot().context.editingTextShapeId).toBe('text-9');

    actor.send({ type: 'COMMIT_TEXT', text: 'after' });
    expect(actor.getSnapshot().context.selectedIds).toEqual(['text-9']);
  });
});

describe('the text tool, alongside it', () => {
  const press = (actor: ReturnType<typeof startWith>, point = { x: 12, y: 12 }) =>
    actor.send({
      type: 'POINTER_DOWN',
      point,
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
      hitVertex: null,
    });

  it('still hands the board back to select, with the text held', () => {
    const actor = startWith('text');
    press(actor);
    actor.send({ type: 'COMMIT_TEXT', text: 'hi', shapeId: 'text-2' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.activeTool).toBe('select');
    expect(snapshot.context.selectedIds).toEqual(['text-2']);
  });

  it('still keeps itself, and nothing selected, when it is locked', () => {
    const actor = startWith('text', true);
    press(actor);
    actor.send({ type: 'COMMIT_TEXT', text: 'hi', shapeId: 'text-3' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.activeTool).toBe('text');
    expect(snapshot.context.selectedIds).toEqual([]);
  });
});
