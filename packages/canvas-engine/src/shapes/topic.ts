import type { Rect } from '../math.js';
import { measureTextWidth } from '../utils/text-measure.js';
import {
  fontSizeOf,
  shapeScale,
  type MindMapLayout,
  type MindMapLines,
  type TopicLook,
  type TopicShape,
} from './shape.js';
import { resolveBaseStyle, type BaseStyleInput } from './style.js';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from './text.js';

/**
 * The colours new topics take in turn: the panel's own stroke swatches bar
 * black, and two more hues past them, so neighbouring topics read apart and
 * the centre keeps the ink. Any of them can be changed from the panel.
 */
export const BRANCH_COLORS = [
  '#e03131',
  '#2f9e44',
  '#1971c2',
  '#f08c00',
  '#7048e8',
  '#0c8599',
] as const;

/**
 * The colour after this one, round and round — what a topic grown from one
 * of this colour takes, so it never comes out the same as where it grew
 * from. A colour not in the list starts the round.
 */
export function nextBranchColor(color: string): string {
  const index = BRANCH_COLORS.findIndex((each) => each === color.toLowerCase());
  return BRANCH_COLORS[(index + 1) % BRANCH_COLORS.length]!;
}

/** A centre's outline is this much heavier than its branches'. */
export const CENTRE_STROKE_WIDTH = 3;
export const BRANCH_STROKE_WIDTH = 2;

/** Space around the words, as a fraction of the font size. */
const PADDING_X = 0.75;
const PADDING_Y = 0.45;
/** The narrowest a box gets, as a fraction of the font size, so an empty one can be aimed at. */
const MIN_TEXT_WIDTH = 2;
/** Corner radius, as a fraction of the font size. */
const CORNER_RADIUS = 0.45;
const LINE_HEIGHT = 1.2;

export function createTopic(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    text: string;
    parentId: string | null;
    side?: 'left' | 'right';
    order?: number;
    collapsed?: boolean;
    mapLayout?: MindMapLayout;
    mapLines?: MindMapLines;
    topicShape?: TopicLook;
    fontSize?: number;
    fontFamily?: string;
  },
): TopicShape {
  return {
    kind: 'topic',
    id: input.id,
    x: input.x,
    y: input.y,
    text: input.text,
    fontSize: input.fontSize ?? DEFAULT_FONT_SIZE,
    fontFamily: input.fontFamily ?? DEFAULT_FONT_FAMILY,
    parentId: input.parentId,
    side: input.side ?? 'right',
    order: input.order ?? 0,
    ...(input.collapsed === true && { collapsed: true }),
    ...(input.mapLayout && input.mapLayout !== 'both' && { mapLayout: input.mapLayout }),
    ...(input.mapLines && input.mapLines !== 'curved' && { mapLines: input.mapLines }),
    ...(input.topicShape && input.topicShape !== 'rounded' && { topicShape: input.topicShape }),
    ...resolveBaseStyle(input),
    strokeWidth:
      input.strokeWidth ?? (input.parentId === null ? CENTRE_STROKE_WIDTH : BRANCH_STROKE_WIDTH),
    // Drawn as a clean box: hatching and jitter would fight the words inside.
    fillStyle: 'solid',
    roughness: 0,
    strokeStyle: 'solid',
  };
}

/**
 * A line's width in this font.
 *
 * The board is read outside a browser too — a test, a script tidying stored
 * boards — where there is no canvas to measure with. A map read there still
 * has to come out laid out, so it falls back to a guess at the width.
 */
function lineWidth(text: string, font: string, fontSize: number): number {
  try {
    return measureTextWidth(text, font);
  } catch {
    return text.length * fontSize * 0.55;
  }
}

/** The box a topic's words need, padding included. */
export function topicSize(topic: Pick<TopicShape, 'text' | 'fontSize' | 'fontFamily' | 'scale'>): {
  width: number;
  height: number;
} {
  const fontSize = fontSizeOf(topic);
  const font = `${fontSize}px ${topic.fontFamily}`;
  const lines = topic.text.split('\n');
  let textWidth = fontSize * MIN_TEXT_WIDTH;
  for (const line of lines) textWidth = Math.max(textWidth, lineWidth(line, font, fontSize));
  return {
    width: textWidth + fontSize * PADDING_X * 2,
    height: lines.length * fontSize * LINE_HEIGHT + fontSize * PADDING_Y * 2,
  };
}

export function topicBounds(topic: TopicShape): Rect {
  return { x: topic.x, y: topic.y, ...topicSize(topic) };
}

/** Where a topic's words start, and how they are set. */
export function topicTextLayout(topic: TopicShape): {
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly lineHeight: number;
} {
  const fontSize = fontSizeOf(topic);
  const { width } = topicSize(topic);
  return {
    x: topic.x + width / 2,
    // Half the leading above the first line, as a browser sets a line box —
    // so the words sit in the middle of the box, and exactly where they were
    // while they were being typed into the overlay.
    y: topic.y + fontSize * PADDING_Y + (fontSize * (LINE_HEIGHT - 1)) / 2,
    fontSize,
    lineHeight: fontSize * LINE_HEIGHT,
  };
}

export const MIND_MAP_LAYOUTS: readonly MindMapLayout[] = ['both', 'right', 'left', 'down'];
export const MIND_MAP_LINES: readonly MindMapLines[] = ['curved', 'straight', 'elbow'];
export const TOPIC_LOOKS: readonly TopicLook[] = ['rounded', 'pill', 'rectangle', 'underline'];

/** A stored layout, or `both` for anything this client does not know. */
export function readMapLayout(value: unknown): MindMapLayout {
  return MIND_MAP_LAYOUTS.includes(value as MindMapLayout) ? (value as MindMapLayout) : 'both';
}
export function readMapLines(value: unknown): MindMapLines {
  return MIND_MAP_LINES.includes(value as MindMapLines) ? (value as MindMapLines) : 'curved';
}
export function readTopicLook(value: unknown): TopicLook {
  return TOPIC_LOOKS.includes(value as TopicLook) ? (value as TopicLook) : 'rounded';
}

export function topicCornerRadius(topic: TopicShape): number {
  switch (readTopicLook(topic.topicShape)) {
    case 'pill':
      return topicSize(topic).height / 2;
    case 'rectangle':
      return fontSizeOf(topic) * 0.1;
    default:
      return fontSizeOf(topic) * CORNER_RADIUS;
  }
}

/**
 * Where a line meets a topic on one of its sides: the middle of that side —
 * or for an underlined topic, whose box is not drawn, the end of the rule
 * under its words, so the line runs on into it.
 */
export function topicAnchor(
  topic: TopicShape,
  side: 'left' | 'right' | 'top' | 'bottom',
): { x: number; y: number } {
  const { width, height } = topicSize(topic);
  const underlined = readTopicLook(topic.topicShape) === 'underline';
  switch (side) {
    case 'left':
      return { x: topic.x, y: topic.y + (underlined ? height : height / 2) };
    case 'right':
      return { x: topic.x + width, y: topic.y + (underlined ? height : height / 2) };
    case 'top':
      return { x: topic.x + width / 2, y: topic.y };
    case 'bottom':
      return { x: topic.x + width / 2, y: topic.y + height };
  }
}

/** A topic's centre, where the overlay for its words is centred. */
export function topicCentre(topic: TopicShape): { x: number; y: number } {
  const { width, height } = topicSize(topic);
  return { x: topic.x + width / 2, y: topic.y + height / 2 };
}

/** The gaps between a topic and its children, and between siblings, at this scale. */
export function topicGaps(topic: Pick<TopicShape, 'scale'>): { across: number; between: number } {
  const scale = shapeScale(topic);
  return { across: 56 * scale, between: 14 * scale };
}
