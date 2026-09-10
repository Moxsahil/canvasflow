import { describe, expect, it } from 'vitest';
import { createActor, type Actor } from 'xstate';
import { strokeWidthOf, type Shape } from '@canvasflow/canvas-engine';
import { toolMachine } from './tool-machine';
import { newShapeScale, IDENTITY_CAMERA } from './tool-machine.types';
import type { Tool } from '@/tools/tool';

/** A board zoomed to `zoom`, with the preference either way. */
function boardAt(zoom: number, dynamicSize: boolean, tool: Tool) {
  const actor = createActor(toolMachine).start();
  actor.send({ type: 'SET_CAMERA', camera: { ...IDENTITY_CAMERA, zoom } });
  actor.send({ type: 'SET_DYNAMIC_SIZE', enabled: dynamicSize });
  actor.send({ type: 'SELECT_TOOL', tool });
  return actor;
}

/** Press, drag far enough to count as a gesture, release. Returns what was made. */
function draw(actor: Actor<typeof toolMachine>): Shape {
  const committed: Shape[] = [];
  actor.on('shape.committed', (event) => committed.push(event.shape));

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

  const shape = committed[0];
  if (!shape) throw new Error('the gesture committed nothing');
  return shape;
}

const DRAWING_TOOLS: Tool[] = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow'];

describe('the scale a new shape is given', () => {
  it('is the reciprocal of the zoom, so a stroke lands at the weight it looks', () => {
    expect(newShapeScale({ ...IDENTITY_CAMERA, zoom: 0.25 }, true)).toBe(4);
    expect(newShapeScale({ ...IDENTITY_CAMERA, zoom: 4 }, true)).toBe(0.25);
  });

  it('is 1 at every zoom while the preference is off', () => {
    for (const zoom of [0.1, 0.25, 1, 2, 5]) {
      expect(newShapeScale({ ...IDENTITY_CAMERA, zoom }, false)).toBe(1);
    }
  });

  it('cancels the zoom exactly, which is the whole of the feature', () => {
    for (const zoom of [0.1, 0.4, 1, 2.5, 5]) {
      const drawn = draw(boardAt(zoom, true, 'rectangle'));
      // Stored width times zoom is what reaches the screen. It has to come out
      // at the chosen width whatever the camera was doing.
      expect(strokeWidthOf(drawn) * zoom).toBeCloseTo(drawn.strokeWidth, 10);
    }
  });
});

describe('drawing with dynamic size on', () => {
  it('reaches every tool that draws', () => {
    for (const tool of DRAWING_TOOLS) {
      const drawn = draw(boardAt(0.5, true, tool));
      expect(drawn.scale, tool).toBe(2);
    }
  });

  it('reaches a freehand stroke', () => {
    const actor = boardAt(0.5, true, 'freehand');
    const committed: Shape[] = [];
    actor.on('shape.committed', (event) => committed.push(event.shape));

    actor.send({
      type: 'POINTER_DOWN',
      point: { x: 0, y: 0 },
      button: 0,
      shiftKey: false,
      hitShapeId: null,
      hitHandle: null,
      hitVertex: null,
    });
    for (let i = 1; i <= 5; i++) {
      actor.send({
        type: 'POINTER_MOVE',
        point: { x: i * 4, y: i * 3 },
        screenDelta: { x: 0, y: 0 },
      });
    }
    actor.send({ type: 'POINTER_UP', point: { x: 20, y: 15 } });

    expect(committed[0]?.scale).toBe(2);
  });

  it('leaves the chosen stroke width legible to the panel', () => {
    const drawn = draw(boardAt(0.25, true, 'rectangle'));
    // What the panel reads is still the preset that was picked...
    expect(drawn.strokeWidth).toBe(2);
    // ...while what gets drawn is four times as wide.
    expect(strokeWidthOf(drawn)).toBe(8);
  });

  it('gives a frame nothing, since its border and label are chrome', () => {
    expect(draw(boardAt(0.25, true, 'frame')).scale).toBeUndefined();
  });
});

describe('drawing with dynamic size off', () => {
  it('stores no scale at all, so the board is written as it always was', () => {
    for (const tool of DRAWING_TOOLS) {
      expect(draw(boardAt(0.25, false, tool)).scale, tool).toBeUndefined();
    }
  });

  it('is what a board zoomed to 1:1 produces either way', () => {
    expect(draw(boardAt(1, true, 'rectangle')).scale).toBeUndefined();
    expect(draw(boardAt(1, false, 'rectangle')).scale).toBeUndefined();
  });
});

describe('turning the preference off', () => {
  it('leaves a shape already drawn exactly as it was', () => {
    const actor = boardAt(0.25, true, 'rectangle');
    const drawn = draw(actor);

    actor.send({ type: 'SET_DYNAMIC_SIZE', enabled: false });

    // The multiplier belongs to the shape, not to the session that made it.
    expect(drawn.scale).toBe(4);
    expect(strokeWidthOf(drawn)).toBe(8);
  });
});
