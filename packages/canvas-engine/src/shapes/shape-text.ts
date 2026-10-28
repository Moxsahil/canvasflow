import type { Rect } from '../math.js';
import { measureTextWidth } from '../utils/text-measure.js';
import { shapeScale, type ShapeText, type TextContainerShape } from './shape.js';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from './text.js';

/**
 * Words written inside a box, an ellipse or a diamond — see `ShapeText`.
 *
 * One layout, shared by the canvas renderer, the SVG exporter, the text
 * overlay and search, so the words drawn, the words exported and the words
 * being typed cannot disagree about where they go.
 */

/** Line advance, the same factor the text renderer draws with. */
const LINE_HEIGHT = 1.2;

/** Clear space kept between the words and the shape's edge, at 1:1. */
export const SHAPE_TEXT_PADDING = 8;

/**
 * How wide a shape grows, at most, to keep its longest word on one line. A
 * word longer than this — an address, usually — is broken across lines rather
 * than stretching the shape across the board.
 */
const MAX_WORD_WIDTH = 400;

/** The room an empty line is given for a caret, as a fraction of its font size. */
const CARET_WIDTH = 0.5;

const ALIGNS = ['left', 'center', 'right'] as const;

export interface ShapeTextInput {
  label?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
}

/**
 * The text fields worth keeping from what a factory was given: a shape with no
 * text and no text style carries none of them, so it is written exactly as it
 * was before shapes could hold text.
 */
export function shapeTextFields(input: ShapeTextInput): ShapeText {
  const { label, fontSize, fontFamily, textAlign } = input;
  return {
    ...(typeof label === 'string' && label !== '' && { label }),
    ...(typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize > 0 && { fontSize }),
    ...(typeof fontFamily === 'string' && fontFamily !== '' && { fontFamily }),
    ...(textAlign !== undefined && ALIGNS.includes(textAlign) && { textAlign }),
  };
}

/**
 * The text fields a new shape is made with: none at all unless it is made
 * with words. A shape is drawn in the style of the panel, which carries a font
 * and an alignment for text shapes; a box drawn with them would hold its first
 * words left-aligned in whatever font the last text used. Its words are given
 * their font when they are first written, and stay centred unless changed.
 */
export function newShapeTextFields(input: ShapeTextInput): ShapeText {
  return typeof input.label === 'string' && input.label !== '' ? shapeTextFields(input) : {};
}

/**
 * A shape's words, checked at every read rather than trusted: anything that is
 * not a string reads as none. They arrive from storage, from files and from
 * other clients, and a Y.Text where a string belongs has taken a board down
 * before.
 */
export function shapeTextOf(shape: ShapeText): string {
  return typeof shape.label === 'string' ? shape.label : '';
}

export interface ShapeTextFont {
  /** As drawn: the stored size times the shape's scale. */
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly textAlign: 'left' | 'center' | 'right';
}

/** What a shape's words are set in, with the defaults for whatever it does not say. */
export function shapeTextFont(shape: TextContainerShape): ShapeTextFont {
  const size =
    typeof shape.fontSize === 'number' && Number.isFinite(shape.fontSize) && shape.fontSize > 0
      ? shape.fontSize
      : DEFAULT_FONT_SIZE;
  return {
    fontSize: size * shapeScale(shape),
    fontFamily:
      typeof shape.fontFamily === 'string' && shape.fontFamily !== ''
        ? shape.fontFamily
        : DEFAULT_FONT_FAMILY,
    // Centred unless told otherwise: words in a shape are a caption on it.
    textAlign:
      shape.textAlign !== undefined && ALIGNS.includes(shape.textAlign)
        ? shape.textAlign
        : 'center',
  };
}

/** The box itself, the right way out whichever way it was drawn. */
function boxOf(shape: TextContainerShape): Rect {
  return {
    x: Math.min(shape.x, shape.x + shape.width),
    y: Math.min(shape.y, shape.y + shape.height),
    width: Math.abs(shape.width),
    height: Math.abs(shape.height),
  };
}

/**
 * How much of a shape's box the words may use: the largest upright rectangle
 * that fits inside the shape, less the padding.
 *
 * All of a box. For an ellipse, the rectangle inscribed in it, whose sides are
 * the axes over root two; for a diamond, the one whose corners touch its
 * sides, half its width by half its height.
 */
export function shapeTextArea(shape: TextContainerShape): Rect {
  const box = boxOf(shape);
  const fraction = shape.kind === 'ellipse' ? Math.SQRT1_2 : shape.kind === 'diamond' ? 0.5 : 1;
  const pad = SHAPE_TEXT_PADDING * shapeScale(shape);
  const width = Math.max(0, box.width * fraction - pad * 2);
  const height = Math.max(0, box.height * fraction - pad * 2);
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

/** The other way round: the size of shape whose text area is this size. */
function shapeSizeFor(shape: TextContainerShape, area: number): number {
  const fraction = shape.kind === 'ellipse' ? Math.SQRT1_2 : shape.kind === 'diamond' ? 0.5 : 1;
  return (area + SHAPE_TEXT_PADDING * shapeScale(shape) * 2) / fraction;
}

// Wrapping measures every word of every label on every paint, and the answers
// repeat — the same label at the same width, frame after frame. Kept by what
// decides them, and bounded.
const wrapCache = new Map<string, string[]>();
const WRAP_CACHE_LIMIT = 2000;

/**
 * Text broken into the lines it is drawn in: at its own line breaks, and
 * wherever a line would run past `maxWidth`. Lines break between words; a word
 * that is wider than the line on its own is broken between its characters.
 */
export function wrapText(text: string, font: string, maxWidth: number): string[] {
  const key = `${font}\u0000${Math.round(maxWidth * 10)}\u0000${text}`;
  const cached = wrapCache.get(key);
  if (cached) return cached;

  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (measureTextWidth(candidate, font) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== '') lines.push(line);
      if (measureTextWidth(word, font) <= maxWidth) {
        line = word;
        continue;
      }
      // Too wide for any line: broken where it reaches the edge.
      let part = '';
      for (const character of word) {
        if (part !== '' && measureTextWidth(part + character, font) > maxWidth) {
          lines.push(part);
          part = character;
        } else {
          part += character;
        }
      }
      line = part;
    }
    lines.push(line);
  }

  if (wrapCache.size >= WRAP_CACHE_LIMIT) wrapCache.clear();
  wrapCache.set(key, lines);
  return lines;
}

export interface ShapeTextLayout {
  readonly lines: readonly string[];
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly textAlign: 'left' | 'center' | 'right';
  /** Where every line is drawn from: its left, middle or right, by `textAlign`. */
  readonly x: number;
  /** Top of the first line, for a renderer drawing from a top baseline. */
  readonly textTop: number;
  /** The room the words have: see `shapeTextArea`. */
  readonly area: Rect;
  /** Height of the words themselves, glyph top to glyph bottom. */
  readonly height: number;
}

/**
 * Where a shape's words go: wrapped to its text area, and in the middle of it
 * top to bottom.
 *
 * `null` for a shape with no words — unless `caret` is set, for a shape whose
 * words are open for typing, which needs a place for the caret to stand
 * before the first character lands.
 */
export function shapeTextLayout(
  shape: TextContainerShape,
  { caret = false }: { caret?: boolean } = {},
): ShapeTextLayout | null {
  const text = shapeTextOf(shape);
  if (text === '' && !caret) return null;

  const { fontSize, fontFamily, textAlign } = shapeTextFont(shape);
  const area = shapeTextArea(shape);
  const font = `${fontSize}px ${fontFamily}`;
  // At least room for a character, or a box drawn narrower than its padding
  // would stack its words a letter to a line.
  const lines = wrapText(text, font, Math.max(area.width, fontSize * CARET_WIDTH));
  // The glyphs, not the line boxes: the last line carries no leading under
  // it, so measuring whole lines would hang the words above the middle.
  const height = (lines.length - 1) * fontSize * LINE_HEIGHT + fontSize;

  const x =
    textAlign === 'left'
      ? area.x
      : textAlign === 'right'
        ? area.x + area.width
        : area.x + area.width / 2;
  // In the middle while they fit; from the top once they do not, so the first
  // line stays in the shape rather than climbing out of it.
  const textTop = Math.max(area.y, area.y + (area.height - height) / 2);

  return { lines, fontSize, fontFamily, textAlign, x, textTop, area, height };
}

/**
 * The shape grown, where its words need more room than it has: taller, to hold
 * every line, and wider, to keep its longest word on one line, up to a limit.
 * It never shrinks — a shape drawn larger than its words is left as drawn.
 *
 * Grown from its top-left, which stays where it is.
 */
export function fitShapeToText<T extends TextContainerShape>(shape: T): T {
  const text = shapeTextOf(shape);
  if (text.trim() === '') return shape;

  const { fontSize, fontFamily } = shapeTextFont(shape);
  const font = `${fontSize}px ${fontFamily}`;
  const box = boxOf(shape);

  let width = box.width;
  const widestWord = Math.max(...text.split(/\s+/).map((word) => measureTextWidth(word, font)));
  const wordRoom = Math.min(widestWord, MAX_WORD_WIDTH * shapeScale(shape));
  if (shapeTextArea(shape).width < wordRoom) width = Math.ceil(shapeSizeFor(shape, wordRoom));

  const widened = width === box.width ? shape : { ...shape, x: box.x, width };
  const layout = shapeTextLayout(widened);
  if (!layout) return widened;
  const height = Math.ceil(shapeSizeFor(widened, layout.height));
  if (height <= box.height) return widened;
  return { ...widened, y: box.y, height };
}
