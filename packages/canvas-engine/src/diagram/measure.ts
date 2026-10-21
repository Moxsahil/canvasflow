/**
 * How big each part of a diagram is, before anything is placed.
 *
 * Shared by both layouts, so a diagram laid out by either keeps the same boxes
 * and only moves them. Sizes come from the measured words, which is what lets a
 * box fit its label rather than every box being one size.
 */

import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from '../shapes/text.js';
import type { Arrowhead, Edges, FillStyle, Roughness, StrokeStyle } from '../shapes/style.js';
import { measureTextWidth } from '../utils/text-measure.js';
import type { DiagramNode, DiagramText, TextSize } from './ir.js';

/**
 * How a diagram is drawn: the same choices the style panel offers for a shape
 * drawn by hand. The editor passes whatever the panel is set to, so a
 * generated box is the box the person would have drawn.
 */
export interface DiagramStyle {
  readonly strokeWidth: number;
  readonly strokeStyle: StrokeStyle;
  readonly roughness: Roughness;
  readonly edges: Edges;
  readonly fillStyle: FillStyle;
  /**
   * Whether boxes are filled at all. A box drawn by hand is empty unless the
   * panel has a fill colour, and a generated one follows suit: when filled,
   * each box takes the pale fill of its colour, hatched or solid as the panel
   * says.
   */
  readonly filled: boolean;
  readonly fontFamily: string;
  /** For the words in a box; titles and headings are drawn larger. */
  readonly fontSize: number;
  /** The head on an arrow's pointed end, and on both ends of a two-way one. */
  readonly arrowhead: Arrowhead;
}

/** The board's own defaults, for a diagram drawn with no style given. */
export const DEFAULT_DIAGRAM_STYLE: DiagramStyle = {
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  edges: 'round',
  fillStyle: 'hachure',
  filled: false,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  arrowhead: 'arrow',
};

/** Titles and headings, as multiples of the words in a box. */
const TEXT_SCALE: Record<TextSize, number> = { title: 1.8, heading: 1.4, body: 1 };

export function textFontSize(style: DiagramStyle, size: TextSize): number {
  return Math.round(style.fontSize * TEXT_SCALE[size]);
}

/** The top of a group's box, where its name is written. */
export function groupNameRoom(style: DiagramStyle): number {
  return Math.ceil(style.fontSize * LINE_HEIGHT) + 12;
}

/** An arrow's words are drawn at the board's label size; see `arrowLabelFont`. */
export const EDGE_LABEL_FONT_SIZE = DEFAULT_FONT_SIZE;

/** As the renderer spaces lines of text. */
export const LINE_HEIGHT = 1.2;

/** Space around the words inside a box. */
const PADDING_X = 20;
const PADDING_Y = 14;

const MIN_WIDTH = 120;
const MIN_HEIGHT = 48;

/** Where a label starts wrapping rather than stretching its box. */
const WRAP_WIDTH = 180;
/** Narrower under a standalone icon, so the words stay about its width. */
const ICON_WRAP_WIDTH = 132;

/** An icon beside the words in a box is about this many times their size. */
const INLINE_ICON_RATIO = 1.5;
export const INLINE_ICON_GAP = 10;
/** Room on the left of a box before its icon. */
export const INLINE_ICON_INSET = 16;

/** A node that is only its icon, and the gap down to its words. */
export const ICON_NODE_SIZE = 56;
export const ICON_LABEL_GAP = 8;

/**
 * A diamond's corners cut into its box, so a label that fits the box does not
 * fit the shape. Growing the box is cheaper than measuring the rhombus. An
 * ellipse loses less to its curve.
 */
const INFLATION: Record<DiagramNode['kind'], number> = {
  rectangle: 1,
  ellipse: 1.2,
  diamond: 1.45,
  icon: 1,
};

export function diagramFont(size: number, family: string): string {
  return `${size}px ${family}`;
}

export interface WrappedText {
  /** Newline-separated. */
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Break words across lines at word boundaries.
 *
 * A word longer than the wrap width is left alone rather than split: a hyphen
 * inserted into somebody's identifier is worse than a wide box.
 */
export function wrapText(
  text: string,
  fontSize: number,
  wrapWidth: number,
  family: string,
): WrappedText {
  const font = diagramFont(fontSize, family);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { label: text, width: 0, height: fontSize * LINE_HEIGHT };

  const lines: string[] = [];
  let current = words[0]!;

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]!}`;
    if (measureTextWidth(candidate, font) <= wrapWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);

  let width = 0;
  for (const line of lines) width = Math.max(width, measureTextWidth(line, font));

  return {
    label: lines.join('\n'),
    width: Math.ceil(width),
    height: Math.ceil(lines.length * fontSize * LINE_HEIGHT),
  };
}

export interface SizedNode extends DiagramNode {
  readonly label: string;
  /** The part arrows attach to: the box, or for an icon node the icon. */
  readonly width: number;
  readonly height: number;
  /** The words' own size — under the icon for an icon node, inside the box otherwise. */
  readonly labelWidth: number;
  readonly labelHeight: number;
  /** An icon inside a box: how big it is drawn. */
  readonly iconSize: number;
}

export function sizeNode(node: DiagramNode, style: DiagramStyle): SizedNode {
  const iconSize = Math.round(style.fontSize * INLINE_ICON_RATIO);
  if (node.kind === 'icon') {
    const wrapped = wrapText(node.text, style.fontSize, ICON_WRAP_WIDTH, style.fontFamily);
    return {
      ...node,
      label: wrapped.label,
      width: ICON_NODE_SIZE,
      height: ICON_NODE_SIZE,
      labelWidth: wrapped.width,
      labelHeight: wrapped.height,
      iconSize,
    };
  }

  const wrapped = wrapText(node.text, style.fontSize, WRAP_WIDTH, style.fontFamily);
  // Only a rectangle carries its icon inside; the curve of an ellipse or a
  // diamond leaves no corner to put one in.
  const iconRoom =
    node.icon !== undefined && node.kind === 'rectangle'
      ? iconSize + INLINE_ICON_GAP + INLINE_ICON_INSET - PADDING_X
      : 0;
  const inflation = INFLATION[node.kind];
  const width = Math.max(
    MIN_WIDTH,
    Math.round((wrapped.width + iconRoom + PADDING_X * 2) * inflation),
  );
  const height = Math.max(
    MIN_HEIGHT,
    Math.round((Math.max(wrapped.height, iconRoom > 0 ? iconSize : 0) + PADDING_Y * 2) * inflation),
  );
  return {
    ...node,
    label: wrapped.label,
    width,
    height,
    labelWidth: wrapped.width,
    labelHeight: wrapped.height,
    iconSize,
  };
}

export interface SizedText extends DiagramText {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/** A title runs as wide as it likes; anything else wraps as a box label does. */
export function sizeText(text: DiagramText, style: DiagramStyle): SizedText {
  const wrapped = wrapText(
    text.text,
    textFontSize(style, text.size),
    text.size === 'title' ? Infinity : WRAP_WIDTH * 1.4,
    style.fontFamily,
  );
  return { ...text, label: wrapped.label, width: wrapped.width, height: wrapped.height };
}
