import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { toolMachine } from './tool-machine';

describe('toolMachine', () => {
  it('starts in idle state with select tool', () => {
    const actor = createActor(toolMachine).start();
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.activeTool).toBe('select');
  });

  it('switches tools on SELECT_TOOL', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'rectangle' });
    expect(actor.getSnapshot().context.activeTool).toBe('rectangle');
  });

  it('transitions to drawingShape on POINTER_DOWN when rectangle tool is active', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'rectangle' });
    actor.send({ type: 'POINTER_DOWN', point: { x: 100, y: 100 } });
    expect(actor.getSnapshot().value).toBe('drawingShape');
    expect(actor.getSnapshot().context.newElement).not.toBeNull();
  });

  it('does not create a shape on POINTER_UP if user did not drag', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'rectangle' });
    actor.send({ type: 'POINTER_DOWN', point: { x: 100, y: 100 } });
    actor.send({ type: 'POINTER_UP', point: { x: 100, y: 100 } });
    // Should have returned to idle and cleared newElement
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.newElement).toBeNull();
  });

  it('returns to select tool after committing a shape', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'rectangle' });
    actor.send({ type: 'POINTER_DOWN', point: { x: 100, y: 100 } });
    actor.send({ type: 'POINTER_MOVE', point: { x: 200, y: 200 } });
    actor.send({ type: 'POINTER_UP', point: { x: 200, y: 200 } });
    // Auto-transitions through committing to idle with select tool
    expect(actor.getSnapshot().context.activeTool).toBe('select');
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('ESCAPE cancels an in-progress draw', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'rectangle' });
    actor.send({ type: 'POINTER_DOWN', point: { x: 100, y: 100 } });
    actor.send({ type: 'POINTER_MOVE', point: { x: 150, y: 150 } });
    actor.send({ type: 'ESCAPE' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.newElement).toBeNull();
  });

  it('accumulates freehand points on POINTER_MOVE', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'freehand' });
    actor.send({ type: 'POINTER_DOWN', point: { x: 100, y: 100 } });
    actor.send({ type: 'POINTER_MOVE', point: { x: 110, y: 110 } });
    actor.send({ type: 'POINTER_MOVE', point: { x: 120, y: 120 } });
    actor.send({ type: 'POINTER_MOVE', point: { x: 130, y: 130 } });
    expect(actor.getSnapshot().context.freehandPoints.length).toBe(4);
  });
});
