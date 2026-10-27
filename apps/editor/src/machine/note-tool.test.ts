import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { createNote, noteBounds, type NoteShape, type Shape } from '@canvasflow/canvas-engine';
import { resizeShape, toolMachine } from './tool-machine';

const down = (x: number, y: number) =>
  ({
    type: 'POINTER_DOWN',
    point: { x, y },
    button: 0,
    shiftKey: false,
    hitShapeId: null,
    hitHandle: null,
    hitVertex: null,
  }) as const;

/** The note tool in hand, and whatever it commits collected. */
function noteTool() {
  const actor = createActor(toolMachine).start();
  const committed: Shape[] = [];
  actor.on('shape.committed', (event) => committed.push(event.shape));
  actor.send({ type: 'SELECT_TOOL', tool: 'note' });
  return { actor, committed };
}

describe('the note tool', () => {
  it('puts down a note of the usual size, centred on a press', () => {
    const { actor, committed } = noteTool();
    actor.send(down(300, 200));
    actor.send({ type: 'POINTER_UP', point: { x: 300, y: 200 } });
    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({ kind: 'note', x: 200, y: 100, width: 200, height: 200 });
  });

  it('sizes the paper to a drag, up and to the left as well', () => {
    const { actor, committed } = noteTool();
    actor.send(down(300, 300));
    actor.send({ type: 'POINTER_MOVE', point: { x: 100, y: 150 }, screenDelta: { x: 0, y: 0 } });
    actor.send({ type: 'POINTER_UP', point: { x: 100, y: 150 } });
    expect(committed[0]).toMatchObject({ x: 100, y: 150, width: 200, height: 150 });
  });

  it('never leaves a dragged note smaller than a note can be', () => {
    const { actor, committed } = noteTool();
    actor.send(down(100, 100));
    actor.send({ type: 'POINTER_MOVE', point: { x: 120, y: 110 }, screenDelta: { x: 0, y: 0 } });
    actor.send({ type: 'POINTER_UP', point: { x: 120, y: 110 } });
    expect(committed[0]).toMatchObject({ x: 100, y: 100, width: 80, height: 80 });
  });

  it('holds the note selected and hands back select, unless the lock holds the tool', () => {
    const { actor, committed } = noteTool();
    actor.send(down(0, 0));
    actor.send({ type: 'POINTER_UP', point: { x: 0, y: 0 } });
    expect(actor.getSnapshot().context.selectedIds).toEqual([committed[0]!.id]);
    expect(actor.getSnapshot().context.activeTool).toBe('select');

    const locked = noteTool();
    locked.actor.send({ type: 'SET_TOOL_LOCK', locked: true });
    locked.actor.send(down(0, 0));
    locked.actor.send({ type: 'POINTER_UP', point: { x: 0, y: 0 } });
    expect(locked.actor.getSnapshot().context.activeTool).toBe('note');
    expect(locked.actor.getSnapshot().context.selectedIds).toEqual([locked.committed[0]!.id]);
  });

  it("takes the notes' own paper, size and alignment, and the shared ink and face", () => {
    const { actor, committed } = noteTool();
    actor.send({
      type: 'SET_ITEM_STYLE',
      style: {
        noteColor: '#a5d8ff',
        noteFontSize: 36,
        noteTextAlign: 'left',
        strokeColor: '#e03131',
        fillColor: '#ffc9c9',
        fontSize: 16,
      },
    });
    actor.send(down(0, 0));
    actor.send({ type: 'POINTER_UP', point: { x: 0, y: 0 } });
    expect(committed[0]).toMatchObject({
      fillColor: '#a5d8ff',
      fontSize: 36,
      textAlign: 'left',
      strokeColor: '#e03131',
    });
  });

  it('says which notes were put down by a press, the ones that may settle beside another', () => {
    const actor = createActor(toolMachine).start();
    const presses: Array<boolean | undefined> = [];
    actor.on('shape.committed', (event) => presses.push(event.pressed));
    actor.send({ type: 'SET_TOOL_LOCK', locked: true });
    actor.send({ type: 'SELECT_TOOL', tool: 'note' });
    actor.send(down(0, 0));
    actor.send({ type: 'POINTER_UP', point: { x: 1, y: 1 } });
    actor.send(down(500, 500));
    actor.send({ type: 'POINTER_MOVE', point: { x: 800, y: 800 }, screenDelta: { x: 0, y: 0 } });
    actor.send({ type: 'POINTER_UP', point: { x: 800, y: 800 } });
    expect(presses).toEqual([true, undefined]);
  });

  it('grows the note by the zoom when dynamic size is on', () => {
    const { actor, committed } = noteTool();
    actor.send({ type: 'SET_DYNAMIC_SIZE', enabled: true });
    actor.send({ type: 'SET_CAMERA', camera: { x: 0, y: 0, zoom: 0.5 } });
    actor.send(down(0, 0));
    actor.send({ type: 'POINTER_UP', point: { x: 0, y: 0 } });
    expect(committed[0]).toMatchObject({ width: 400, height: 400, scale: 2 });
  });
});

describe('resizing a note', () => {
  const grown = (): NoteShape =>
    createNote({
      id: 'n',
      x: 0,
      y: 0,
      text: 'every word written here makes the note fuller still '.repeat(30),
    });

  it('starts from the paper as drawn, grown part included', () => {
    const note = grown();
    const drawn = noteBounds(note).height;
    expect(drawn).toBeGreaterThan(note.height);
    // The bottom edge pulled down by 10 lands 10 below where it was drawn.
    const resized = resizeShape(note, 5, 0, 10) as NoteShape;
    expect(resized.height).toBe(drawn + 10);
  });

  it('stops at the smallest a note can be, pinned at the opposite edge', () => {
    const note = createNote({ id: 'n', x: 0, y: 0 });
    const fromRight = resizeShape(note, 3, -190, 0) as NoteShape;
    expect(fromRight).toMatchObject({ x: 0, width: 80 });
    const fromLeft = resizeShape(note, 7, 190, 0) as NoteShape;
    expect(fromLeft).toMatchObject({ x: 120, width: 80 });
  });
});
