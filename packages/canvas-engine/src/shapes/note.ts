import type { Rect } from '../math.js';
import { measureTextWidth } from '../utils/text-measure.js';
import { fontSizeOf, shapeScale, type NoteShape } from './shape.js';
import { DEFAULT_STROKE_COLOR, resolveBaseStyle, type BaseStyleInput } from './style.js';
import { DEFAULT_FONT_FAMILY } from './text.js';

/**
 * The papers a note comes in, palest first-pick first. Notes keep colours of
 * their own rather than the panel's fills: a note is always filled, never
 * see-through, and pale enough in both themes for dark ink to read on it.
 */
export const NOTE_COLORS = [
  '#ffec99',
  '#ffd8a8',
  '#fcc2d7',
  '#d0bfff',
  '#a5d8ff',
  '#96f2d7',
  '#b2f2bb',
  '#e9ecef',
] as const;

export const DEFAULT_NOTE_COLOR = NOTE_COLORS[0];
export const DEFAULT_NOTE_SIZE = 200;
export const DEFAULT_NOTE_FONT_SIZE = 24;

/** Space between the paper's edge and the words, at 1:1. */
const PADDING = 16;
/**
 * The strip under the paper, at 1:1: the heart people like a note with on
 * the left, the name of who wrote it on the right. Outside the paper, so the
 * words have all of it, and notes stacked in a column leave it room.
 */
export const NOTE_FOOT_HEIGHT = 30;
/** The smallest the words are set before the note grows instead, at 1:1. */
const MIN_FONT_SIZE = 14;
/** How far apart the sizes tried are, at 1:1. */
const FONT_STEP = 2;
const LINE_HEIGHT = 1.25;
/** The smallest paper anyone can leave a note at, at 1:1. */
export const MIN_NOTE_SIZE = 80;

export function createNote(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    textAlign?: 'left' | 'center' | 'right';
    author?: string;
  },
): NoteShape {
  return {
    kind: 'note',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width ?? DEFAULT_NOTE_SIZE,
    height: input.height ?? DEFAULT_NOTE_SIZE,
    text: input.text ?? '',
    fontSize: input.fontSize ?? DEFAULT_NOTE_FONT_SIZE,
    fontFamily: input.fontFamily ?? DEFAULT_FONT_FAMILY,
    textAlign: input.textAlign ?? 'center',
    ...resolveBaseStyle(input),
    strokeColor: input.strokeColor ?? DEFAULT_STROKE_COLOR,
    fillColor: input.fillColor ?? DEFAULT_NOTE_COLOR,
    // Drawn as clean paper: hatching and jitter would fight the words on it.
    fillStyle: 'solid',
    roughness: 0,
    strokeStyle: 'solid',
    // Trimmed, and left off rather than kept empty, so a note with no name
    // carries no key for one.
    ...(input.author?.trim() && { author: input.author.trim() }),
  };
}

/** One line of a note's words, and where in `text` it starts. */
export interface NoteLine {
  readonly text: string;
  readonly start: number;
}

export interface NoteLayout {
  /** The paper as drawn: the given width, and at least the given height. */
  readonly width: number;
  readonly height: number;
  /** The size the words came out at, scale included. */
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly lines: readonly NoteLine[];
  /** The x each line is aligned on, as a text shape's is. */
  readonly textX: number;
  /** The top of the first line. */
  readonly textY: number;
  /** The widest the words may run before they wrap. */
  readonly textWidth: number;
}

/**
 * A line's width in this font. Outside a browser — a test, a script tidying
 * stored boards — there is no canvas to measure with, and a guess is what the
 * note is laid out by there, as a topic is.
 */
function lineWidth(text: string, font: string, fontSize: number): number {
  try {
    return measureTextWidth(text, font);
  } catch {
    return text.length * fontSize * 0.55;
  }
}

interface Wrapped {
  readonly lines: NoteLine[];
  /** A word was wider than the room on its own, and was not broken. */
  readonly overflows: boolean;
}

/**
 * The words broken into lines no wider than `maxWidth`.
 *
 * Lines break where a newline was typed, and between words where they run
 * out of room. A word too wide on its own is broken between characters only
 * when `breakWords` says so — otherwise it is left whole and `overflows` set,
 * which tells the fit to try a smaller size first.
 *
 * Every line keeps the offset it starts at in `text`, so anything matching
 * against the words can find where on the paper a match was drawn.
 */
function wrapNoteText(
  text: string,
  font: string,
  fontSize: number,
  maxWidth: number,
  breakWords: boolean,
): Wrapped {
  const lines: NoteLine[] = [];
  let overflows = false;
  const fits = (value: string) => lineWidth(value, font, fontSize) <= maxWidth;

  let paragraphStart = 0;
  for (const paragraph of text.split('\n')) {
    const words = [...paragraph.matchAll(/\S+/g)];
    if (words.length === 0) lines.push({ text: '', start: paragraphStart });

    let lineStart = -1;
    let lineEnd = -1;
    for (const word of words) {
      const wordStart = word.index;
      const wordEnd = wordStart + word[0].length;

      if (lineStart !== -1 && fits(paragraph.slice(lineStart, wordEnd))) {
        lineEnd = wordEnd;
        continue;
      }
      if (lineStart !== -1) {
        lines.push({
          text: paragraph.slice(lineStart, lineEnd),
          start: paragraphStart + lineStart,
        });
      }

      if (fits(word[0])) {
        lineStart = wordStart;
        lineEnd = wordEnd;
        continue;
      }
      if (!breakWords) {
        overflows = true;
        lineStart = wordStart;
        lineEnd = wordEnd;
        continue;
      }
      // Broken between characters, whole characters only: a surrogate pair
      // split in two would draw as two broken glyphs.
      let pieceStart = wordStart;
      let piece = '';
      for (const char of word[0]) {
        if (piece !== '' && !fits(piece + char)) {
          lines.push({ text: piece, start: paragraphStart + pieceStart });
          pieceStart += piece.length;
          piece = '';
        }
        piece += char;
      }
      lineStart = pieceStart;
      lineEnd = wordEnd;
    }
    if (lineStart !== -1) {
      lines.push({ text: paragraph.slice(lineStart, lineEnd), start: paragraphStart + lineStart });
    }
    paragraphStart += paragraph.length + 1;
  }
  return { lines, overflows };
}

const layoutCache = new Map<string, NoteLayout>();
const LAYOUT_CACHE_LIMIT = 512;

type LayoutInput = Pick<
  NoteShape,
  'width' | 'height' | 'text' | 'fontSize' | 'fontFamily' | 'textAlign' | 'scale'
>;

/**
 * Where a note's words go and how big its paper is drawn, relative to its
 * top-left corner.
 *
 * The words are set at the size asked for if they fit. If not, at the largest
 * size on a grid stepping down from it that does — the grid hangs from the
 * size asked for, so the result depends only on the note as it is, never on
 * the edits that led there. Only at the smallest size does the paper grow
 * taller instead, and only by what the words need.
 *
 * Kept, keyed by what goes into it, because every frame draws every note and
 * fitting means measuring. Shapes are read afresh from the document, so the
 * key is the values rather than the object.
 */
function relativeNoteLayout(note: LayoutInput): NoteLayout {
  const key = [
    note.width,
    note.height,
    note.fontSize,
    note.scale ?? 1,
    note.fontFamily,
    note.textAlign,
    note.text,
  ].join('\u0000');
  const cached = layoutCache.get(key);
  if (cached) return cached;

  const scale = shapeScale(note);
  const padding = PADDING * scale;
  const width = Math.max(note.width, padding * 2 + 1);
  const baseHeight = Math.max(note.height, padding * 2 + 1);
  const textWidth = width - padding * 2;
  const room = baseHeight - padding * 2;

  const ceiling = fontSizeOf(note);
  const floor = Math.min(MIN_FONT_SIZE * scale, ceiling);
  const step = FONT_STEP * scale;
  // Sizes tried, largest first: down from the ceiling a step at a time, and
  // the floor itself last however the steps fall.
  const sizes: number[] = [];
  for (let size = ceiling; size > floor; size -= step) sizes.push(size);
  sizes.push(floor);

  const attempt = (size: number, breakWords: boolean) => {
    const wrapped = wrapNoteText(
      note.text,
      `${size}px ${note.fontFamily}`,
      size,
      textWidth,
      breakWords,
    );
    const fits = !wrapped.overflows && wrapped.lines.length * size * LINE_HEIGHT <= room;
    return { ...wrapped, fits, size };
  };

  let chosen = attempt(ceiling, false);
  if (!chosen.fits && note.text !== '') {
    // The largest size that fits. Words that fit at one size fit at every
    // smaller one, so the sizes that fit are a run at the small end and a
    // halving search finds where it starts.
    let low = 1;
    let high = sizes.length - 1;
    let best: ReturnType<typeof attempt> | null = null;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const tried = attempt(sizes[middle]!, false);
      if (tried.fits) {
        best = tried;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }
    chosen = best ?? attempt(floor, true);
  }

  const fontSize = chosen.size;
  const lineHeight = fontSize * LINE_HEIGHT;
  const textHeight = (note.text === '' ? 1 : chosen.lines.length) * lineHeight;
  const height = Math.max(baseHeight, textHeight + padding * 2);
  const bodyHeight = height - padding * 2;

  const layout: NoteLayout = {
    width,
    height,
    fontSize,
    lineHeight,
    lines: note.text === '' ? [] : chosen.lines,
    textX:
      note.textAlign === 'left'
        ? padding
        : note.textAlign === 'right'
          ? width - padding
          : width / 2,
    textY: padding + (bodyHeight - textHeight) / 2,
    textWidth,
  };

  // Cleared wholesale rather than evicted one by one, as search's widths are.
  if (layoutCache.size >= LAYOUT_CACHE_LIMIT) layoutCache.clear();
  layoutCache.set(key, layout);
  return layout;
}

/** A note's layout in board coordinates. */
export function noteLayout(note: NoteShape): NoteLayout {
  const layout = relativeNoteLayout(note);
  return { ...layout, textX: note.x + layout.textX, textY: note.y + layout.textY };
}

export function noteBounds(note: NoteShape): Rect {
  const { width, height } = relativeNoteLayout(note);
  return { x: note.x, y: note.y, width, height };
}

/** The face the author's name is set in, whatever the note's words are. */
const FOOTER_FONT_FAMILY = 'Helvetica, Arial, system-ui, sans-serif';
const FOOTER_FONT_SIZE = 12;
/** The heart's height, at 1:1. */
const HEART_SIZE = 16;
/**
 * The left-hand end of the strip, kept for the heart and its count: a name
 * long enough to reach it is cut short first.
 */
const LIKE_ROOM = 48;

/** How tall the strip under a note's paper is, at its scale. */
export function noteFootHeight(note: Pick<NoteShape, 'scale'>): number {
  return NOTE_FOOT_HEIGHT * shapeScale(note);
}

/** The middle of the strip under the paper, in board coordinates. */
function footMiddle(note: NoteShape, height: number): number {
  return note.y + height + noteFootHeight(note) / 2;
}

export interface NoteFooter {
  /** The name, cut short with an ellipsis where it would run past the heart. */
  readonly text: string;
  /** Its right-hand end and its middle, in board coordinates. */
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly fontFamily: string;
}

/**
 * Where the author's name goes: under the paper, at its right-hand end.
 * Null when the note has no author.
 */
export function noteFooter(note: NoteShape): NoteFooter | null {
  if (!note.author) return null;
  const scale = shapeScale(note);
  const { height, width } = relativeNoteLayout(note);
  const fontSize = FOOTER_FONT_SIZE * scale;
  const font = `${fontSize}px ${FOOTER_FONT_FAMILY}`;
  const room = width - LIKE_ROOM * scale;
  const fits = (value: string) => lineWidth(value, font, fontSize) <= room;

  let text = note.author;
  if (!fits(text)) {
    // Whole characters off the end until it fits with its ellipsis.
    const chars = [...text];
    while (chars.length > 0 && !fits(`${chars.join('')}…`)) chars.pop();
    text = chars.length > 0 ? `${chars.join('').trimEnd()}…` : '';
  }
  if (text === '') return null;

  return {
    text,
    x: note.x + width,
    y: footMiddle(note, height),
    fontSize,
    fontFamily: FOOTER_FONT_FAMILY,
  };
}

/** The strip under the paper, where the name is drawn: what an export must take in. */
export function noteFootBounds(note: NoteShape): Rect {
  const { height, width } = relativeNoteLayout(note);
  return { x: note.x, y: note.y + height, width, height: noteFootHeight(note) };
}

export interface NoteLikeSpot {
  /** The left-hand end and the middle of the heart and its count, in board coordinates. */
  readonly left: number;
  readonly y: number;
  /** The heart's height, in board units. */
  readonly size: number;
}

/** Where the heart goes: under the paper, at its left-hand end, level with the name. */
export function noteLikeSpot(note: NoteShape): NoteLikeSpot {
  const { height } = relativeNoteLayout(note);
  return { left: note.x, y: footMiddle(note, height), size: HEART_SIZE * shapeScale(note) };
}

/** The smallest a note can be made, at its scale. */
export function minNoteSize(note: Pick<NoteShape, 'scale'>): number {
  return MIN_NOTE_SIZE * shapeScale(note);
}

/** How round the paper's corners are. */
export function noteCornerRadius(note: NoteShape): number {
  const { width, height } = noteBounds(note);
  return Math.min(Math.min(width, height) * 0.03, 6 * shapeScale(note));
}

/** How far below the paper its shadow falls. */
export function noteShadowOffset(note: Pick<NoteShape, 'scale'>): number {
  return 3 * shapeScale(note);
}
