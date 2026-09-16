import type { Point, Rect } from '../math.js';
import { measureTextWidth } from '../utils/text-measure.js';
import { shapeScale, type ArrowShape } from './shape.js';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from './text.js';

/** Line advance, the same factor the text renderer draws with. */
const LINE_HEIGHT = 1.2;

/**
 * Clear space kept between the label and the two stubs of arrow it interrupts,
 * so the text reads as sitting in a gap rather than crowding into one.
 */
const LABEL_PADDING = 6;

/**
 * The room an empty label is given, as a fraction of its font size, so that a
 * caret waiting for its first character stands in a gap rather than on the
 * line.
 */
const CARET_WIDTH = 0.5;

/**
 * An arrow's label, checked at every read rather than trusted.
 *
 * The same reasoning as `shapeScale`, and for a sharper reason: every arrow
 * drawn before labels existed carries no label at all, and those arrive from
 * storage, from a board file, from another client and from a clipboard payload
 * written by an older build. Deserialization guarantees the field where it can
 * — but the clipboard hands its own JSON straight to the board, so the readers
 * stay total. Anything that is not a string reads as no label.
 */
export function arrowLabelOf(shape: ArrowShape): string {
  return typeof shape.label === 'string' ? shape.label : '';
}

/**
 * The middle of the arrow, where its label sits.
 *
 * An odd number of points has a vertex exactly in the middle to use; an even
 * number has its middle in the span between the two central ones. Taken by
 * index rather than by arc length: it is stable under a drag of any other
 * vertex, and for the two-point arrow that nearly every arrow is, the two
 * answers are the same one.
 *
 * Answered even for an arrow with no label, because that is where a label
 * being typed into it has to appear.
 */
export function arrowLabelAnchor(shape: ArrowShape): Point {
  const { points } = shape;
  const middle = points.length / 2;

  if (points.length % 2 === 1) {
    const [px, py] = points[(points.length - 1) / 2]!;
    return { x: shape.x + px, y: shape.y + py };
  }

  const [ax, ay] = points[middle - 1]!;
  const [bx, by] = points[middle]!;
  return { x: shape.x + (ax + bx) / 2, y: shape.y + (ay + by) / 2 };
}

/**
 * What an arrow's label is set in.
 *
 * The board's text defaults, scaled the way the arrow's own stroke is, so a
 * label drawn at one zoom carries the weight it was given at every other. Not
 * stored on the shape: a label is a caption on an arrow rather than a piece of
 * text in its own right, and giving it styling of its own would mean carrying
 * — and syncing — settings nothing in the editor can change.
 */
export function arrowLabelFont(shape: ArrowShape): { fontSize: number; fontFamily: string } {
  return { fontSize: DEFAULT_FONT_SIZE * shapeScale(shape), fontFamily: DEFAULT_FONT_FAMILY };
}

export interface ArrowLabelLayout {
  readonly lines: readonly string[];
  readonly fontSize: number;
  readonly fontFamily: string;
  /** Centre of the text, which is also the centre of `box`. */
  readonly anchor: Point;
  /** Top of the first line, for a renderer drawing from a top baseline. */
  readonly textTop: number;
  /** The space the arrow is broken for: the text, plus its padding. */
  readonly box: Rect;
}

/**
 * Where an arrow's label goes and how much room it takes.
 *
 * `null` for an unlabelled arrow — the one answer every caller needs, since a
 * label that isn't there is not drawn, breaks no gap in the line and adds
 * nothing to the arrow's bounds.
 *
 * `caret` is for an arrow whose label is open for typing: the line breaks the
 * moment the caret lands rather than when the first character does, so the
 * caret has somewhere to stand instead of sitting across the line, and the gap
 * then grows under what is being typed.
 *
 * One layout shared by the bounds, the canvas renderer and the SVG exporter,
 * so the gap a label is given and the text drawn into it cannot disagree.
 */
export function arrowLabelLayout(
  shape: ArrowShape,
  { caret = false }: { caret?: boolean } = {},
): ArrowLabelLayout | null {
  const label = arrowLabelOf(shape);
  if (label === '' && !caret) return null;

  const { fontSize, fontFamily } = arrowLabelFont(shape);
  const lines = label.split('\n');
  const font = `${fontSize}px ${fontFamily}`;

  let width = caret ? fontSize * CARET_WIDTH : 0;
  for (const line of lines) {
    const lineWidth = measureTextWidth(line, font);
    if (lineWidth > width) width = lineWidth;
  }
  // The glyphs, not the line boxes: the last line carries no leading under it,
  // so measuring in whole lines would hang the text above the arrow by half a
  // line's leading — visibly, and differently for one line than for three.
  const height = (lines.length - 1) * fontSize * LINE_HEIGHT + fontSize;

  const anchor = arrowLabelAnchor(shape);
  const padding = LABEL_PADDING * shapeScale(shape);
  const textTop = anchor.y - height / 2;

  return {
    lines,
    fontSize,
    fontFamily,
    anchor,
    textTop,
    box: {
      x: anchor.x - width / 2 - padding,
      y: textTop - padding,
      width: width + padding * 2,
      height: height + padding * 2,
    },
  };
}
