import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { BoardDocument } from '../src/document/document.js';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape.js';
import { exportRegion } from '../src/export/export-scene.js';
import { renderStaticScene } from '../src/renderers/static.js';
import { renderSceneToSvgString } from '../src/renderers/svg-scene.js';
import { sanitizeShape } from '../src/sanitize/sanitize-shape.js';
import { canBindTo } from '../src/shapes/arrow-binding.js';
import { shapeBounds } from '../src/shapes/bounds.js';
import {
  createNote,
  DEFAULT_NOTE_COLOR,
  DEFAULT_NOTE_FONT_SIZE,
  DEFAULT_NOTE_SIZE,
  noteFooter,
  noteLayout,
  noteFootHeight,
  noteLikeSpot,
} from '../src/shapes/note.js';
import { shapeContainsPoint } from '../src/shapes/outline.js';
import type { NoteShape } from '../src/shapes/shape.js';

function note(overrides: Partial<Parameters<typeof createNote>[0]> = {}): NoteShape {
  return createNote({ id: 'n1', x: 100, y: 50, seed: 1, ...overrides });
}

function integrate(map: Y.Map<unknown>): Y.Map<unknown> {
  const doc = new Y.Doc();
  doc.getArray<Y.Map<unknown>>('shapes').push([map]);
  return doc.getArray<Y.Map<unknown>>('shapes').get(0);
}

const LONG = 'the quick brown fox jumps over the lazy dog '.repeat(2).trim();
const HUGE = 'every word written here makes the note fuller still '.repeat(30).trim();

describe('createNote', () => {
  it('makes a square of yellow paper with dark ink and no words', () => {
    const shape = note();
    expect(shape).toMatchObject({
      kind: 'note',
      width: DEFAULT_NOTE_SIZE,
      height: DEFAULT_NOTE_SIZE,
      text: '',
      fontSize: DEFAULT_NOTE_FONT_SIZE,
      textAlign: 'center',
      fillColor: DEFAULT_NOTE_COLOR,
      fillStyle: 'solid',
      roughness: 0,
    });
  });

  it('keeps paper even when asked for none', () => {
    expect(note({ fillColor: null }).fillColor).toBe(DEFAULT_NOTE_COLOR);
  });
});

describe('noteLayout', () => {
  it('sets a few words at the size asked for, without growing', () => {
    const layout = noteLayout(note({ text: 'hello' }));
    expect(layout.fontSize).toBe(DEFAULT_NOTE_FONT_SIZE);
    expect(layout.height).toBe(DEFAULT_NOTE_SIZE);
    expect(layout.lines).toEqual([{ text: 'hello', start: 0 }]);
  });

  it('shrinks the words before it grows the paper', () => {
    const layout = noteLayout(note({ text: LONG }));
    expect(layout.fontSize).toBeLessThan(DEFAULT_NOTE_FONT_SIZE);
    expect(layout.height).toBe(DEFAULT_NOTE_SIZE);
  });

  it('grows taller, never wider, once the words are at their smallest', () => {
    const layout = noteLayout(note({ text: HUGE }));
    expect(layout.fontSize).toBe(14);
    expect(layout.width).toBe(DEFAULT_NOTE_SIZE);
    expect(layout.height).toBeGreaterThan(DEFAULT_NOTE_SIZE);
    expect(shapeBounds(note({ text: HUGE })).height).toBe(layout.height);
  });

  it('keeps every line inside the paper', () => {
    for (const text of [LONG, HUGE, 'a'.repeat(400)]) {
      const shape = note({ text });
      const layout = noteLayout(shape);
      const bottom = layout.textY + layout.lines.length * layout.lineHeight;
      expect(bottom).toBeLessThanOrEqual(shape.y + layout.height);
      expect(layout.textY).toBeGreaterThanOrEqual(shape.y);
    }
  });

  it('breaks a word too long for the paper between characters, losing none', () => {
    const word = 'x'.repeat(400);
    const layout = noteLayout(note({ text: word }));
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.map((line) => line.text).join('')).toBe(word);
  });

  it('keeps where each line starts in the words, newlines included', () => {
    const text = 'first line\nsecond';
    const layout = noteLayout(note({ text }));
    for (const line of layout.lines) {
      expect(text.slice(line.start, line.start + line.text.length)).toBe(line.text);
    }
    expect(layout.lines.map((line) => line.text)).toEqual(['first line', 'second']);
  });

  it('keeps the size asked for as the ceiling, whatever size it is', () => {
    const big = noteLayout(note({ text: 'hi', fontSize: 48 }));
    expect(big.fontSize).toBe(48);
  });

  it('comes out the same however the words were arrived at', () => {
    const typed = noteLayout(note({ text: LONG.slice(0, 40) }));
    noteLayout(note({ text: LONG }));
    expect(noteLayout(note({ text: LONG.slice(0, 40) }))).toEqual(typed);
  });

  it('scales with the note, words and padding alike', () => {
    const plain = noteLayout(note({ text: 'hello' }));
    const scaled = noteLayout(note({ text: 'hello', scale: 2, width: 400, height: 400 }));
    expect(scaled.fontSize).toBe(plain.fontSize * 2);
  });

  it('aligns lines on the left, middle or right of the room for words', () => {
    const shape = note({ text: 'hello' });
    expect(noteLayout({ ...shape, textAlign: 'left' }).textX).toBeLessThan(noteLayout(shape).textX);
    expect(noteLayout({ ...shape, textAlign: 'right' }).textX).toBeGreaterThan(
      noteLayout(shape).textX,
    );
  });
});

describe('a note on the board', () => {
  it('is found anywhere on its paper, grown part included', () => {
    const shape = note({ text: HUGE });
    const { height } = noteLayout(shape);
    expect(shapeContainsPoint(shape, 200, 150)).toBe(true);
    expect(shapeContainsPoint(shape, 200, 50 + height - 2)).toBe(true);
    expect(shapeContainsPoint(shape, 90, 150)).toBe(false);
  });

  it('takes arrows', () => {
    expect(canBindTo(note())).toBe(true);
  });

  it('round-trips through the document', () => {
    const original = note({ text: 'buy milk', textAlign: 'left', fillColor: '#a5d8ff' });
    expect(yMapToShape(integrate(shapeToYMap(original)))).toEqual(original);
  });

  it('reads unusable stored sizes as the defaults rather than NaN', () => {
    const map = shapeToYMap(note());
    map.set('width', Number.NaN);
    map.set('height', -5);
    map.set('fontSize', 'big');
    map.set('textAlign', 'justify');
    const shape = yMapToShape(integrate(map)) as NoteShape;
    expect(shape).toMatchObject({
      width: DEFAULT_NOTE_SIZE,
      height: DEFAULT_NOTE_SIZE,
      fontSize: DEFAULT_NOTE_FONT_SIZE,
      textAlign: 'center',
    });
  });

  it('comes in from a board file through the sanitizer', () => {
    const shape = sanitizeShape({ ...note({ text: 'hi' }), fillColor: null }, () => 'fresh');
    expect(shape).toMatchObject({ kind: 'note', id: 'fresh', text: 'hi' });
    expect(shape?.fillColor).toBe(DEFAULT_NOTE_COLOR);
  });

  it('is refused from a board file without usable words or size', () => {
    expect(sanitizeShape({ ...note(), text: { y: 'text' } }, () => 'x')).toBeNull();
    expect(sanitizeShape({ ...note(), width: 0 }, () => 'x')).toBeNull();
  });

  it('paints its paper on the canvas', () => {
    const canvas = new OffscreenCanvas(400, 300);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    renderStaticScene(ctx, canvas, { width: 400, height: 300, shapes: [note({ text: 'hi' })] });
    // The middle of the paper is the paper's colour, not the board's.
    const [r, g, b] = ctx.getImageData(130, 70, 1, 1).data;
    expect([r, g, b]).toEqual([0xff, 0xec, 0x99]);
  });

  it('keeps its ink on a dark board', () => {
    const svg = renderSceneToSvgString([note({ text: 'hi' })], { darkMode: true });
    expect(svg).toContain('fill="#1e1e1e"');
    expect(svg).toContain(`fill="${DEFAULT_NOTE_COLOR}"`);
    expect(svg).toContain('>hi</text>');
  });

  it('carries its author through the document, and none when it has none', () => {
    const signed = note({ author: 'Asha Rao' });
    expect(yMapToShape(integrate(shapeToYMap(signed)))).toEqual(signed);
    expect(shapeToYMap(note()).has('author')).toBe(false);
    expect(note({ author: '   ' })).not.toHaveProperty('author');
  });

  it('is signed by whoever duplicates it, and by nobody when nobody is signed in', () => {
    const doc = new BoardDocument();
    doc.replaceShapes([note({ author: 'Asha Rao' })]);
    const [signed] = doc.duplicateShapes(['n1'], { dx: 10, dy: 10 }, () => 'by-ravi', 'Ravi');
    const [unsigned] = doc.duplicateShapes(['n1'], { dx: 20, dy: 20 }, () => 'by-nobody');
    const byId = (id: string) => doc.getShapes().find((shape) => shape.id === id) as NoteShape;
    expect(byId(signed!).author).toBe('Ravi');
    expect(byId(unsigned!)).not.toHaveProperty('author');
    expect(byId('n1').author).toBe('Asha Rao');
    doc.destroy();
  });

  it('writes its author under the paper, at its right-hand end', () => {
    const shape = note({ text: 'hi', author: 'Asha Rao' });
    const footer = noteFooter(shape);
    const layout = noteLayout(shape);
    expect(footer?.text).toBe('Asha Rao');
    expect(footer!.x).toBe(shape.x + layout.width);
    expect(footer!.y).toBeGreaterThan(shape.y + layout.height);
    expect(noteFooter(note())).toBeNull();
    const svg = renderSceneToSvgString([shape]);
    expect(svg).toContain('>Asha Rao</text>');
    expect(svg).toContain('text-anchor="end"');
  });

  it('gives the words the whole paper, signed or not', () => {
    const signed = noteLayout(note({ text: 'hi', author: 'Asha Rao' }));
    const unsigned = noteLayout(note({ text: 'hi' }));
    expect(signed).toEqual(unsigned);
    expect(unsigned.textY + unsigned.lineHeight / 2).toBeCloseTo(50 + DEFAULT_NOTE_SIZE / 2);
  });

  it('writes the author in the board’s ink, light on a dark board', () => {
    const shape = note({ author: 'Asha Rao' });
    expect(renderSceneToSvgString([shape], { darkMode: true })).not.toContain(
      `fill="#1e1e1e" fill-opacity`,
    );
  });

  it('cuts a long author short rather than run under the heart', () => {
    const footer = noteFooter(note({ author: 'Somebody With A Very Long Name Indeed '.repeat(4) }));
    expect(footer?.text.endsWith('…')).toBe(true);
  });

  it('puts the heart under the paper at its left-hand end, level with the name', () => {
    const signed = note({ text: HUGE, author: 'Asha Rao' });
    const layout = noteLayout(signed);
    const spot = noteLikeSpot(signed);
    expect(spot.left).toBe(signed.x);
    expect(spot.y).toBeCloseTo(noteFooter(signed)!.y);
    expect(spot.y - spot.size / 2).toBeGreaterThanOrEqual(signed.y + layout.height);
    expect(spot.y + spot.size / 2).toBeLessThanOrEqual(
      signed.y + layout.height + noteFootHeight(signed),
    );
  });

  it('takes in the author under the bottom note when exported', () => {
    const shape = note({ author: 'Asha Rao' });
    const region = exportRegion([shape], { padding: 0 });
    expect(region.y + region.height).toBe(shape.y + DEFAULT_NOTE_SIZE + noteFootHeight(shape));
    expect(exportRegion([note()], { padding: 0 }).height).toBe(DEFAULT_NOTE_SIZE);
  });

  it('exports every line of its words to SVG', () => {
    const svg = renderSceneToSvgString([note({ text: 'one\ntwo' })]);
    expect(svg).toContain('>one</text>');
    expect(svg).toContain('>two</text>');
  });
});
