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
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 100, y: 100 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
    });
    expect(actor.getSnapshot().value).toBe('drawingShape');
    expect(actor.getSnapshot().context.newElement).not.toBeNull();
  });

  it('does not create a shape on POINTER_UP if user did not drag', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'rectangle' });
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 100, y: 100 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
    });
    actor.send({ type: 'POINTER_UP', point: { x: 100, y: 100 } });
    // Should have returned to idle and cleared newElement
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.newElement).toBeNull();
  });

  it('keeps the active tool after committing a shape', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'rectangle' });
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 100, y: 100 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
    });
    actor.send({ type: 'POINTER_MOVE', point: { x: 200, y: 200 }, screenDelta: { x: 0, y: 0 } });
    actor.send({ type: 'POINTER_UP', point: { x: 200, y: 200 } });
    // The tool is sticky: drawing several shapes in a row shouldn't mean
    // re-picking the tool between each one. Committing returns the machine
    // to idle but deliberately leaves activeTool alone.
    expect(actor.getSnapshot().context.activeTool).toBe('rectangle');
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('ESCAPE cancels an in-progress draw', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'rectangle' });
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 100, y: 100 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
    });
    actor.send({ type: 'POINTER_MOVE', point: { x: 150, y: 150 }, screenDelta: { x: 0, y: 0 } });
    actor.send({ type: 'ESCAPE' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.newElement).toBeNull();
  });

  it('grows a frame as it is dragged out', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'frame' });
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 10, y: 10 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
    });
    actor.send({ type: 'POINTER_MOVE', point: { x: 210, y: 110 }, screenDelta: { x: 0, y: 0 } });

    // The frame tool started life missing from the sizing switch, whose
    // `default` returned no change — so every frame committed at the one
    // pixel it was created with and landed on the board as a dot.
    expect(actor.getSnapshot().context.newElement).toMatchObject({
      kind: 'frame',
      x: 10,
      y: 10,
      width: 200,
      height: 100,
    });
  });

  it('anchors a frame dragged up and to the left', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'frame' });
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 300, y: 300 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
    });
    actor.send({ type: 'POINTER_MOVE', point: { x: 100, y: 200 }, screenDelta: { x: 0, y: 0 } });

    expect(actor.getSnapshot().context.newElement).toMatchObject({
      kind: 'frame',
      x: 100,
      y: 200,
      width: 200,
      height: 100,
    });
  });

  it('accumulates freehand points on POINTER_MOVE', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SELECT_TOOL', tool: 'freehand' });
    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 100, y: 100 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
    });
    actor.send({ type: 'POINTER_MOVE', point: { x: 110, y: 110 }, screenDelta: { x: 0, y: 0 } });
    actor.send({ type: 'POINTER_MOVE', point: { x: 120, y: 120 }, screenDelta: { x: 0, y: 0 } });
    actor.send({ type: 'POINTER_MOVE', point: { x: 130, y: 130 }, screenDelta: { x: 0, y: 0 } });
    expect(actor.getSnapshot().context.freehandPoints.length).toBe(4);
  });

  it('moves the camera on PAN_BY', () => {
    // The wheel handler negates the raw deltas, so scrolling down arrives here
    // as a negative dy and has to move the camera down the page.
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'PAN_BY', dx: 0, dy: -100 });
    expect(actor.getSnapshot().context.camera).toMatchObject({ x: 0, y: 100 });

    actor.send({ type: 'PAN_BY', dx: -40, dy: 0 });
    expect(actor.getSnapshot().context.camera).toMatchObject({ x: 40, y: 100 });
  });

  it('pans a smaller world distance the further you are zoomed in', () => {
    const actor = createActor(toolMachine).start();
    actor.send({ type: 'SET_CAMERA', camera: { x: 0, y: 0, zoom: 2 } });
    actor.send({ type: 'PAN_BY', dx: 0, dy: -100 });
    expect(actor.getSnapshot().context.camera).toMatchObject({ y: 50, zoom: 2 });
  });
});
