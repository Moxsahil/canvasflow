import { describe, expect, it } from 'vitest';
import { createNote, createRectangle, noteBounds, type NoteShape } from '@canvasflow/canvas-engine';
import {
  cameraShowing,
  freeNoteSpots,
  noteBeside,
  nudgeIntoSpot,
  signedCopies,
  spotBeside,
  NOTE_GAP,
} from './note-neighbours';

const note = (id: string, x: number, y: number, extra: Partial<NoteShape> = {}): NoteShape => ({
  ...createNote({ id, x, y, seed: 1 }),
  ...extra,
});

describe('the spot beside a note', () => {
  it('lines up with the top of a note beside it and the left of one above or below', () => {
    const from = note('a', 0, 0);
    const size = { width: 200, height: 200 };
    expect(spotBeside(from, 'right', size)).toEqual({ x: 200 + NOTE_GAP, y: 0 });
    expect(spotBeside(from, 'left', size)).toEqual({ x: -200 - NOTE_GAP, y: 0 });
    expect(spotBeside(from, 'down', size)).toEqual({ x: 0, y: 200 + NOTE_GAP });
    expect(spotBeside(from, 'up', size)).toEqual({ x: 0, y: -200 - NOTE_GAP });
  });

  it('goes below the paper as drawn, grown part included', () => {
    const grown = note('a', 0, 0, {
      text: 'every word written here makes the note fuller still '.repeat(30),
    });
    const drawn = noteBounds(grown).height;
    expect(drawn).toBeGreaterThan(200);
    expect(spotBeside(grown, 'down', { width: 200, height: 200 }).y).toBe(drawn + NOTE_GAP);
  });

  it('keeps the gap in step with a note drawn larger for the zoom', () => {
    const big = note('a', 0, 0, { scale: 2, width: 400, height: 400 });
    expect(spotBeside(big, 'right', { width: 400, height: 400 }).x).toBe(400 + NOTE_GAP * 2);
  });
});

describe('the note beside a note', () => {
  it('is a blank copy of its size and style, signed by whoever is adding it', () => {
    const from = note('a', 0, 0, {
      text: 'first',
      width: 240,
      height: 160,
      fillColor: '#a5d8ff',
      textAlign: 'left',
      fontSize: 36,
      author: 'Asha Rao',
    });
    const result = noteBeside(from, 'right', [from], 'b', 'Ravi');
    expect('created' in result && result.created).toMatchObject({
      id: 'b',
      x: 240 + NOTE_GAP,
      y: 0,
      width: 240,
      height: 160,
      text: '',
      fillColor: '#a5d8ff',
      textAlign: 'left',
      fontSize: 36,
      author: 'Ravi',
    });
  });

  it('carries no name where nobody is signed in', () => {
    const from = note('a', 0, 0, { author: 'Asha Rao' });
    const result = noteBeside(from, 'down', [from], 'b', undefined);
    expect('created' in result && result.created).not.toHaveProperty('author');
  });

  it('is the note already standing there, rather than a new one on top of it', () => {
    const from = note('a', 0, 0);
    const there = note('b', 215, 5);
    expect(noteBeside(from, 'right', [from, there], 'c', undefined)).toEqual({ existing: there });
  });

  it('passes over what is not a note', () => {
    const from = note('a', 0, 0);
    const box = createRectangle({ id: 'r', x: 210, y: 0, width: 200, height: 200 });
    expect('created' in noteBeside(from, 'right', [from, box], 'c', undefined)).toBe(true);
  });
});

describe('free spots', () => {
  it('offers every side of a lone note', () => {
    const spots = freeNoteSpots([note('a', 0, 0)], note('m', 900, 900), new Set(['m']));
    expect(spots).toHaveLength(4);
  });

  it('leaves out a spot another note already fills', () => {
    const a = note('a', 0, 0);
    const b = note('b', 210, 0);
    const spots = freeNoteSpots([a, b], note('m', 900, 900), new Set(['m']));
    expect(spots).not.toContainEqual({ x: 210, y: 0 });
    expect(spots).not.toContainEqual({ x: 0, y: 0 });
    expect(spots).toContainEqual({ x: 420, y: 0 });
  });

  it('never offers the notes being moved, nor counts them as in the way', () => {
    const a = note('a', 0, 0);
    const moving = note('m', 210, 0);
    const spots = freeNoteSpots([a, moving], moving, new Set(['m']));
    expect(spots).toContainEqual({ x: 210, y: 0 });
    expect(spots).toHaveLength(4);
  });

  it('fits the spot to the note being moved', () => {
    const small = note('m', 900, 900, { width: 100, height: 100 });
    const spots = freeNoteSpots([note('a', 0, 0)], small, new Set(['m']));
    expect(spots).toContainEqual({ x: -100 - NOTE_GAP, y: 0 });
    expect(spots).toContainEqual({ x: 0, y: -100 - NOTE_GAP });
  });
});

describe('settling into a spot', () => {
  const spots = [
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ];

  it('moves to the nearest spot within reach', () => {
    expect(nudgeIntoSpot({ x: 96, y: 3 }, spots, 10)).toEqual({ dx: 4, dy: -3 });
  });

  it('stays put out of reach of every spot', () => {
    expect(nudgeIntoSpot({ x: 50, y: 50 }, spots, 10)).toBeNull();
  });
});

describe('copies', () => {
  it('are signed by whoever made them, and leave other shapes alone', () => {
    const signed = note('a', 0, 0, { author: 'Asha Rao' });
    const box = createRectangle({ id: 'r', x: 0, y: 0, width: 10, height: 10 });
    const [copy, untouched] = signedCopies([signed, box], 'Ravi');
    expect(copy).toMatchObject({ author: 'Ravi' });
    expect(untouched).toBe(box);
    expect(signedCopies([signed], undefined)[0]).not.toHaveProperty('author');
  });
});

describe('following along', () => {
  const view = { width: 1000, height: 800 };

  it('leaves the camera where it is when the note is already in view', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    expect(cameraShowing({ x: 100, y: 100, width: 200, height: 200 }, camera, view, 16)).toBe(
      camera,
    );
  });

  it('moves just far enough to bring a note in off the edge', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const moved = cameraShowing({ x: 900, y: 100, width: 200, height: 200 }, camera, view, 16);
    expect(moved).toEqual({ x: 900 + 200 + 16 - 1000, y: 0, zoom: 1 });
  });

  it('measures the margin on screen, whatever the zoom', () => {
    const camera = { x: 0, y: 0, zoom: 2 };
    const moved = cameraShowing({ x: -100, y: 0, width: 50, height: 50 }, camera, view, 16);
    expect(moved.x).toBe(-100 - 8);
  });
});
