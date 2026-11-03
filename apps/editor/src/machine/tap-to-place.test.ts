import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { Shape } from '@canvasflow/canvas-engine';
import { toolMachine } from './tool-machine';
import type { Tool } from '../tools/tool';

/** Press and release at one spot with `tool`; returns what was made, if anything. */
type Box = Shape & { x: number; y: number; width: number; height: number };

function tap(tool: Tool, tapToPlace: boolean): Box | undefined {
  const actor = createActor(toolMachine).start();
  const committed: Shape[] = [];
  actor.on('shape.committed', (event) => committed.push(event.shape));
  actor.send({ type: 'SET_TAP_TO_PLACE', enabled: tapToPlace });
  actor.send({ type: 'SELECT_TOOL', tool });
  actor.send({
    type: 'POINTER_DOWN',
    point: { x: 200, y: 100 },
    button: 0,
    shiftKey: false,
    hitShapeId: null,
    hitHandle: null,
    hitVertex: null,
  });
  actor.send({ type: 'POINTER_UP', point: { x: 201, y: 101 } });
  return committed[0] as Box | undefined;
}

describe('tap to place', () => {
  it('makes nothing from a tap where it is off, as on a desktop', () => {
    expect(tap('rectangle', false)).toBeUndefined();
  });

  it('puts down a box of the usual size, centred on the tap', () => {
    const shape = tap('rectangle', true)!;
    expect(shape.kind).toBe('rectangle');
    expect(shape.width).toBe(140);
    expect(shape.height).toBe(88);
    expect(shape.x + shape.width / 2).toBe(200);
    expect(shape.y + shape.height / 2).toBe(100);
  });

  it('gives a frame room for a few shapes', () => {
    const shape = tap('frame', true)!;
    expect(shape.width).toBe(320);
    expect(shape.height).toBe(220);
  });

  it('leaves the tools that need a direction to a drag', () => {
    expect(tap('arrow', true)).toBeUndefined();
    expect(tap('line', true)).toBeUndefined();
  });
});
