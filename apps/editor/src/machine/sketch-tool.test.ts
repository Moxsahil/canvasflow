import { describe, it, expect } from 'vitest';
import { createActor, type Actor } from 'xstate';
import type { Shape } from '@canvasflow/canvas-engine';
import { toolMachine } from './tool-machine';

type Point = readonly [number, number];

/** Walk a closed polygon's perimeter, the way a hand traces one. */
function outline(corners: readonly Point[], samples = 80): Point[] {
  const loop = [...corners, corners[0]!];
  const sides = loop.length - 1;
  const points: Point[] = [];
  for (let i = 0; i < samples; i++) {
    const scaled = (i / (samples - 1)) * sides * 0.9999;
    const side = Math.floor(scaled);
    const along = scaled - side;
    const [ax, ay] = loop[side]!;
    const [bx, by] = loop[side + 1]!;
    points.push([ax + along * (bx - ax), ay + along * (by - ay)]);
  }
  return points;
}

function line(from: Point, to: Point, samples = 30): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    points.push([from[0] + t * (to[0] - from[0]), from[1] + t * (to[1] - from[1])]);
  }
  return points;
}

const RECTANGLE = outline([
  [0, 0],
  [200, 0],
  [200, 120],
  [0, 120],
]);

/** A stroke that resembles nothing this can draw, placed wherever asked. */
function scribble(atX = 0, atY = 0): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 60; i++) {
    const t = i / 59;
    points.push([atX + Math.cos(t * 17) * 90 + Math.sin(t * 6) * 40, atY + Math.sin(t * 23) * 80]);
  }
  return points;
}

/** Start the machine on the sketch tool, collecting whatever it commits. */
function sketching() {
  const actor = createActor(toolMachine).start();
  const committed: Shape[] = [];
  actor.on('shape.committed', (event) => committed.push(event.shape));
  actor.send({ type: 'SELECT_TOOL', tool: 'sketch' });
  return { actor, committed };
}

/** Trace `points` end to end, optionally stopping before the release. */
function trace(
  actor: Actor<typeof toolMachine>,
  points: readonly Point[],
  { release = true }: { release?: boolean } = {},
) {
  const [firstX, firstY] = points[0]!;
  actor.send({
    type: 'POINTER_DOWN',
    point: { x: firstX, y: firstY },
    button: 0,
    shiftKey: false,
    hitShapeId: null,
    hitHandle: null,
  });
  for (const [x, y] of points.slice(1)) {
    actor.send({ type: 'POINTER_MOVE', point: { x, y }, screenDelta: { x: 0, y: 0 } });
  }
  if (release) {
    const [lastX, lastY] = points[points.length - 1]!;
    actor.send({ type: 'POINTER_UP', point: { x: lastX, y: lastY } });
  }
}

describe('the sketch tool', () => {
  it('enters its own state on pointer down', () => {
    const { actor } = sketching();
    trace(actor, RECTANGLE, { release: false });
    expect(actor.getSnapshot().value).toBe('sketching');
  });

  it('commits the shape a stroke was read as, not the stroke', () => {
    const { actor, committed } = sketching();
    trace(actor, RECTANGLE);

    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({ kind: 'rectangle', x: 0, y: 0, width: 200, height: 120 });
  });

  it('commits an ellipse where an ellipse was drawn', () => {
    const { actor, committed } = sketching();
    const circle: Point[] = [];
    for (let i = 0; i < 80; i++) {
      const angle = (i / 79) * Math.PI * 2;
      circle.push([300 + Math.cos(angle) * 90, 200 + Math.sin(angle) * 60]);
    }
    trace(actor, circle);

    expect(committed[0]).toMatchObject({ kind: 'ellipse' });
    expect(committed[0]!.x).toBeCloseTo(210, 0);
    expect(committed[0]!.y).toBeCloseTo(140, 0);
  });

  it('commits a line pointing the way it was drawn', () => {
    const { actor, committed } = sketching();
    trace(actor, line([400, 300], [150, 120]));

    expect(committed[0]).toMatchObject({ kind: 'line', x: 400, y: 300 });
    expect(committed[0]).toHaveProperty('points', [
      [0, 0],
      [-250, -180],
    ]);
  });

  it('keeps a stroke it cannot read rather than discarding it', () => {
    const { actor, committed } = sketching();
    trace(actor, scribble());

    // The tool's promise is that it never eats a gesture. Failing to read one
    // leaves the ink, which is strictly better than an empty canvas.
    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({ kind: 'freehand' });
  });

  it('puts a kept stroke at its own first point, not at the origin', () => {
    const { actor, committed } = sketching();
    const points = scribble(900, 700);
    trace(actor, points);

    // Its points are stored relative to that origin, as every other linear
    // shape here stores them.
    const stroke = committed[0]!;
    expect(stroke.kind).toBe('freehand');
    expect(stroke.x).toBe(points[0]![0]);
    expect(stroke.y).toBe(points[0]![1]);
    expect(stroke).toHaveProperty('points.0', [0, 0]);
  });

  it('commits nothing for a tap', () => {
    const { actor, committed } = sketching();
    trace(actor, [
      [50, 50],
      [51, 50],
    ]);

    expect(committed).toHaveLength(0);
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('stays on the tool so shapes can be sketched one after another', () => {
    const { actor, committed } = sketching();
    trace(actor, RECTANGLE);
    trace(
      actor,
      RECTANGLE.map(([x, y]) => [x + 400, y] as Point),
    );

    expect(actor.getSnapshot().context.activeTool).toBe('sketch');
    expect(committed.map((shape) => shape.kind)).toEqual(['rectangle', 'rectangle']);
  });

  it('previews the outline it has read, faded so it reads as pending', () => {
    const { actor } = sketching();
    trace(actor, RECTANGLE, { release: false });

    const preview = actor.getSnapshot().context.newElement!;
    expect(preview.kind).toBe('rectangle');
    expect(preview.opacity).toBeLessThan(actor.getSnapshot().context.itemStyle.opacity);
  });

  it('previews the stroke itself before it has read anything', () => {
    const { actor } = sketching();
    trace(actor, RECTANGLE.slice(0, 12), { release: false });

    // Two sides in, this is not yet an outline. Showing the ink is honest;
    // guessing would flicker a shape under the hand.
    expect(actor.getSnapshot().context.newElement).toMatchObject({ kind: 'freehand' });
  });

  it('shows no shape while a straight stroke is still being drawn', () => {
    const { actor, committed } = sketching();
    trace(actor, line([0, 0], [240, 0]), { release: false });
    expect(actor.getSnapshot().context.newElement).toMatchObject({ kind: 'freehand' });

    // The line is still committed on release — the preview is held back, not
    // the reading.
    actor.send({ type: 'POINTER_UP', point: { x: 240, y: 0 } });
    expect(committed[0]).toMatchObject({ kind: 'line' });
  });

  it('commits the shape at full strength, not at the preview opacity', () => {
    const { actor, committed } = sketching();
    trace(actor, RECTANGLE);

    expect(committed[0]!.opacity).toBe(actor.getSnapshot().context.itemStyle.opacity);
  });

  it('draws in the style the next shape would be drawn in', () => {
    const { actor, committed } = sketching();
    actor.send({ type: 'SET_ITEM_STYLE', style: { strokeColor: '#e03131', strokeWidth: 4 } });
    trace(actor, RECTANGLE);

    expect(committed[0]).toMatchObject({ strokeColor: '#e03131', strokeWidth: 4 });
  });

  it('judges size as it appears, so the same stroke zoomed out is left alone', () => {
    const small = outline([
      [0, 0],
      [40, 0],
      [40, 30],
      [0, 30],
    ]);

    const near = sketching();
    trace(near.actor, small);
    expect(near.committed[0]).toMatchObject({ kind: 'rectangle' });

    const far = sketching();
    far.actor.send({ type: 'SET_CAMERA', camera: { x: 0, y: 0, zoom: 0.25 } });
    trace(far.actor, small);
    expect(far.committed[0]).toMatchObject({ kind: 'freehand' });
  });

  it('abandons the stroke on escape', () => {
    const { actor, committed } = sketching();
    trace(actor, RECTANGLE, { release: false });
    actor.send({ type: 'ESCAPE' });

    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.newElement).toBeNull();
    expect(actor.getSnapshot().context.sketchPoints).toEqual([]);
    expect(committed).toHaveLength(0);
  });

  it('drops a half-drawn stroke when the tool is switched away', () => {
    const { actor, committed } = sketching();
    trace(actor, RECTANGLE, { release: false });
    actor.send({ type: 'SELECT_TOOL', tool: 'select' });

    expect(actor.getSnapshot().context.sketchPoints).toEqual([]);
    expect(actor.getSnapshot().context.newElement).toBeNull();
    expect(committed).toHaveLength(0);
  });
});
