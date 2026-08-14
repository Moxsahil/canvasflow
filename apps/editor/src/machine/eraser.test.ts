import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { toolMachine } from './tool-machine';

/** Start an actor with the eraser active and a stroke underway. */
function startErasing() {
  const actor = createActor(toolMachine).start();
  const deleted: string[][] = [];
  actor.on('shapes.deleted', (e) => deleted.push([...e.ids]));

  actor.send({ type: 'SELECT_TOOL', tool: 'eraser' });
  actor.send({
    type: 'POINTER_DOWN',
    point: { x: 0, y: 0 },
    button: 0,
    shiftKey: false,
    hitShapeId: null,
    hitHandle: null,
  });
  return { actor, deleted };
}

describe('eraser', () => {
  it('enters the erasing state on pointer down', () => {
    const { actor } = startErasing();
    expect(actor.getSnapshot().value).toBe('erasing');
  });

  it('accumulates marked shapes without deleting them mid-stroke', () => {
    const { actor, deleted } = startErasing();

    actor.send({ type: 'ERASE_MARK', ids: ['a'], restore: false });
    actor.send({ type: 'ERASE_MARK', ids: ['b', 'c'], restore: false });

    expect(actor.getSnapshot().context.erasePending).toEqual(['a', 'b', 'c']);
    // Nothing leaves the document until the stroke ends.
    expect(deleted).toEqual([]);
  });

  it('does not double-count a shape swept twice', () => {
    const { actor } = startErasing();

    actor.send({ type: 'ERASE_MARK', ids: ['a'], restore: false });
    actor.send({ type: 'ERASE_MARK', ids: ['a'], restore: false });

    expect(actor.getSnapshot().context.erasePending).toEqual(['a']);
  });

  it('un-marks a shape when restoring', () => {
    const { actor } = startErasing();

    actor.send({ type: 'ERASE_MARK', ids: ['a', 'b'], restore: false });
    actor.send({ type: 'ERASE_MARK', ids: ['a'], restore: true });

    expect(actor.getSnapshot().context.erasePending).toEqual(['b']);
  });

  it('ignores a restore for a shape that was never marked', () => {
    const { actor } = startErasing();

    actor.send({ type: 'ERASE_MARK', ids: ['a'], restore: false });
    actor.send({ type: 'ERASE_MARK', ids: ['zzz'], restore: true });

    expect(actor.getSnapshot().context.erasePending).toEqual(['a']);
  });

  it('emits one deletion for the whole stroke on pointer up', () => {
    const { actor, deleted } = startErasing();

    actor.send({ type: 'ERASE_MARK', ids: ['a'], restore: false });
    actor.send({ type: 'ERASE_MARK', ids: ['b'], restore: false });
    actor.send({ type: 'POINTER_UP', point: { x: 50, y: 50 } });

    // One event, not one per shape — so the stroke is a single undo step.
    expect(deleted).toEqual([['a', 'b']]);
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('clears the pending set after committing', () => {
    const { actor } = startErasing();

    actor.send({ type: 'ERASE_MARK', ids: ['a'], restore: false });
    actor.send({ type: 'POINTER_UP', point: { x: 1, y: 1 } });

    expect(actor.getSnapshot().context.erasePending).toEqual([]);
  });

  it('starts each stroke from an empty set', () => {
    const { actor, deleted } = startErasing();

    actor.send({ type: 'ERASE_MARK', ids: ['a'], restore: false });
    actor.send({ type: 'POINTER_UP', point: { x: 1, y: 1 } });

    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 10, y: 10 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
    });
    actor.send({ type: 'ERASE_MARK', ids: ['b'], restore: false });
    actor.send({ type: 'POINTER_UP', point: { x: 20, y: 20 } });

    // The second stroke must not re-delete the first stroke's shapes.
    expect(deleted).toEqual([['a'], ['b']]);
  });

  it('leaves shapes alone when a stroke marks nothing', () => {
    const { actor, deleted } = startErasing();
    actor.send({ type: 'POINTER_UP', point: { x: 5, y: 5 } });

    expect(deleted).toEqual([[]]);
  });
});
