import {
  DEFAULT_STROKE_COLOR,
  createArrow,
  createDiamond,
  createEllipse,
  createFrame,
  createFreehand,
  createLine,
  createRectangle,
  createText,
  isArrow,
  readLink,
  type ArrowBinding,
  type Arrowhead,
  type FillStyle,
  type Roughness,
  type Shape,
  type StrokeStyle,
} from '@canvasflow/canvas-engine';
import { FONT_FAMILIES } from '../properties/palette';
import type { ExcalidrawElement } from './schema';

const [HAND_DRAWN, NORMAL, CODE] = FONT_FAMILIES.map((font) => font.value) as [
  string,
  string,
  string,
];

/**
 * Excalidraw's fonts, by number, as the nearest of this editor's three. Its
 * hand-drawn faces, its plain ones and its monospaced ones each become ours,
 * so the font row shows which one a pasted text is in.
 */
const FONT_BY_NUMBER: Readonly<Record<number, string>> = {
  1: HAND_DRAWN, // Virgil
  2: NORMAL, // Helvetica
  3: CODE, // Cascadia
  5: HAND_DRAWN, // Excalifont
  6: NORMAL, // Nunito
  7: NORMAL, // Lilita One
  8: CODE, // Comic Shanns
  9: NORMAL, // Liberation Sans
};

/** The elements text can be bound inside of: written on an arrow, or in a shape. */
const WORD_HOLDERS: ReadonlySet<string> = new Set(['arrow', 'rectangle', 'ellipse', 'diamond']);

const ARROWHEADS: readonly Arrowhead[] = [
  'arrow',
  'bar',
  'circle',
  'circle_outline',
  'triangle',
  'triangle_outline',
  'diamond',
  'diamond_outline',
];

/**
 * Shapes for Excalidraw elements: what its clipboard carries, and what its
 * library files hold.
 *
 * Each element is read field by field with a fallback, and one that cannot be
 * made into a shape is skipped rather than failing the rest. Kept where they
 * apply:
 *
 * - the style: colours, fill and stroke style, width, roughness, opacity and
 *   rounded corners;
 * - frames, with their names;
 * - arrow ends attached to shapes that come along, aimed at the middle of
 *   the shape;
 * - text written on an arrow, which becomes the arrow's label, and text
 *   written in a box, an ellipse or a diamond, which becomes its words.
 *
 * Images are left out, along with deleted elements and kinds this editor has
 * no shape for.
 */
export function excalidrawElementsToShapes(
  elements: readonly ExcalidrawElement[],
  genId: () => string,
): Shape[] {
  const live = elements.filter(
    (el): el is ExcalidrawElement => typeof el === 'object' && el !== null && el.isDeleted !== true,
  );

  // Text inside an arrow, a box, an ellipse or a diamond is that shape's own
  // words here, not a shape of its own.
  const holderIds = new Set(live.filter((el) => WORD_HOLDERS.has(el.type)).map((el) => el.id));
  const labels = new Map<string, ExcalidrawElement>();
  for (const el of live) {
    if (el.type === 'text' && el.containerId && holderIds.has(el.containerId)) {
      labels.set(el.containerId, el);
    }
  }

  const made: { el: ExcalidrawElement; shape: Shape }[] = [];
  const renamed = new Map<string, string>();
  for (const el of live) {
    if (el.type === 'text' && el.containerId && labels.has(el.containerId)) continue;
    let shape: Shape | null;
    try {
      shape = elementToShape(el, genId, labels.get(el.id));
    } catch {
      // A factory refusing what it was given — too few points, say.
      shape = null;
    }
    if (!shape) continue;
    // The same check every other way onto the board makes: their links may
    // be any address at all, and only the ones this board would open come.
    const link = readLink(el.link);
    if (link !== null) shape = { ...shape, link };
    if (typeof el.id === 'string') renamed.set(el.id, shape.id);
    made.push({ el, shape });
  }

  const binding = (value: ExcalidrawElement['startBinding']): ArrowBinding | null => {
    const shapeId = value?.elementId ? renamed.get(value.elementId) : undefined;
    if (!shapeId) return null;
    const fixed = value?.fixedPoint;
    if (Array.isArray(fixed) && unit(fixed[0]) && unit(fixed[1])) {
      return { shapeId, anchor: { x: fixed[0], y: fixed[1] }, precise: true };
    }
    return { shapeId, anchor: { x: 0.5, y: 0.5 }, precise: false };
  };

  return made.map(({ el, shape }) =>
    isArrow(shape)
      ? { ...shape, startBinding: binding(el.startBinding), endBinding: binding(el.endBinding) }
      : shape,
  );
}

function elementToShape(
  el: ExcalidrawElement,
  genId: () => string,
  bound: ExcalidrawElement | undefined,
): Shape | null {
  const label = bound ? textOf(bound) : undefined;
  // A shape's words keep the size and font they were set in; centred, unless
  // they were aligned to a side.
  const words = bound
    ? {
        label: textOf(bound),
        fontSize: finite(bound.fontSize) ?? 20,
        fontFamily:
          (typeof bound.fontFamily === 'number' ? FONT_BY_NUMBER[bound.fontFamily] : undefined) ??
          HAND_DRAWN,
        textAlign: oneOf(bound.textAlign, ['left', 'center', 'right'] as const) ?? 'center',
      }
    : {};
  const x = finite(el.x);
  const y = finite(el.y);
  if (x === undefined || y === undefined) return null;

  const common = {
    id: genId(),
    x,
    y,
    strokeColor: strokeColorOf(el.strokeColor),
    fillColor:
      typeof el.backgroundColor === 'string' && el.backgroundColor !== 'transparent'
        ? el.backgroundColor
        : null,
    fillStyle: fillStyleOf(el.fillStyle),
    strokeWidth: finite(el.strokeWidth) ?? 2,
    strokeStyle: oneOf<StrokeStyle>(el.strokeStyle, ['solid', 'dashed', 'dotted']),
    roughness: roughnessOf(el.roughness),
    opacity: finite(el.opacity),
    rotation: finite(el.angle) ?? 0,
    seed: finite(el.seed) ?? Math.floor(Math.random() * 2 ** 31),
  };
  const width = finite(el.width);
  const height = finite(el.height);
  const edges = el.roundness ? ('round' as const) : ('sharp' as const);

  switch (el.type) {
    case 'rectangle':
      return createRectangle({
        ...common,
        width: width ?? 100,
        height: height ?? 50,
        edges,
        ...words,
      });

    case 'ellipse':
      return createEllipse({ ...common, width: width ?? 100, height: height ?? 50, ...words });

    case 'diamond':
      return createDiamond({
        ...common,
        width: width ?? 100,
        height: height ?? 100,
        edges,
        ...words,
      });

    case 'line': {
      const points = pointsOf(el.points, 2, STRAIGHT);
      return points && createLine({ ...common, points, edges });
    }

    case 'arrow': {
      const points = pointsOf(el.points, 2, STRAIGHT);
      if (!points) return null;
      return createArrow({
        ...common,
        points,
        startArrowhead: arrowheadOf(el.startArrowhead, 'none'),
        endArrowhead: arrowheadOf(el.endArrowhead, 'arrow'),
        arrowType: el.elbowed ? 'elbow' : el.roundness ? 'curved' : 'straight',
        ...(label !== undefined && { label }),
      });
    }

    // `draw` is what the oldest library files call a freehand stroke.
    case 'freedraw':
    case 'draw': {
      const points = pointsOf(el.points, 1, [[0, 0]]);
      if (!points) return null;
      return createFreehand({
        ...common,
        points,
        ...(typeof el.simulatePressure === 'boolean' && {
          simulatePressure: el.simulatePressure,
        }),
      });
    }

    case 'text': {
      // Excalidraw places text by the left of its box, and aligns the lines
      // inside that box. Here the alignment's own point is the text's place,
      // so centred text is placed by its middle — which keeps it centred in
      // whatever it was written on, even where the font is a little wider or
      // narrower than the one it was laid out in.
      const textAlign = oneOf(el.textAlign, ['left', 'center', 'right'] as const) ?? 'left';
      const boxWidth = width ?? 0;
      return createText({
        ...common,
        x: textAlign === 'center' ? x + boxWidth / 2 : textAlign === 'right' ? x + boxWidth : x,
        text: textOf(el),
        fontSize: finite(el.fontSize) ?? 20,
        fontFamily:
          (typeof el.fontFamily === 'number' ? FONT_BY_NUMBER[el.fontFamily] : undefined) ??
          HAND_DRAWN,
        textAlign,
      });
    }

    case 'frame':
    case 'magicframe':
      return createFrame({
        ...common,
        width: width ?? 400,
        height: height ?? 300,
        name: typeof el.name === 'string' ? el.name : '',
      });

    // Images, embeds and anything newer have no shape here.
    default:
      return null;
  }
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function unit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function textOf(el: ExcalidrawElement): string {
  // `text` is the text as wrapped to its container; `originalText` is what
  // was typed. The typed text is what to keep when there is one.
  if (typeof el.originalText === 'string' && el.originalText !== '') return el.originalText;
  return typeof el.text === 'string' ? el.text : '';
}

/**
 * Pure black was the pen before Excalidraw's default became a near-black, and
 * libraries made then are full of it. Both are the default pen here, which is
 * the one stroke that turns light on a dark board.
 */
function strokeColorOf(value: unknown): string {
  if (typeof value !== 'string' || value === '') return DEFAULT_STROKE_COLOR;
  const colour = value.toLowerCase();
  return colour === '#000' || colour === '#000000' ? DEFAULT_STROKE_COLOR : value;
}

function fillStyleOf(value: unknown): FillStyle | undefined {
  // Zigzag has no counterpart; hachure is the nearest.
  if (value === 'zigzag' || value === 'zigzag-line') return 'hachure';
  return oneOf<FillStyle>(value, ['hachure', 'cross-hatch', 'solid']);
}

function roughnessOf(value: unknown): Roughness | undefined {
  return value === 0 || value === 1 || value === 2 ? value : undefined;
}

/** `missing` is for a file that leaves the end out entirely; null is none. */
function arrowheadOf(value: unknown, missing: Arrowhead): Arrowhead {
  if (value === undefined) return missing;
  if (value === null) return 'none';
  if (value === 'dot') return 'circle';
  // Crow's feet and anything newer read as a plain arrowhead.
  return oneOf(value, ARROWHEADS) ?? 'arrow';
}

/**
 * What a line or arrow with too few points becomes: one of the default
 * length, rather than nothing. A degenerate line arriving as a short one is a
 * choice, kept so a drawing opens with every line it had.
 */
const STRAIGHT: Array<[number, number]> = [
  [0, 0],
  [100, 0],
];

/**
 * The points; `fallback` where there are too few or none; null where any of
 * them is not a pair of numbers, which is a broken element rather than a
 * short one.
 */
function pointsOf(
  value: unknown,
  least: number,
  fallback: Array<[number, number]>,
): Array<[number, number]> | null {
  if (!Array.isArray(value) || value.length < least) return fallback;
  const points: Array<[number, number]> = [];
  for (const point of value) {
    if (!Array.isArray(point)) return null;
    const px = finite(point[0]);
    const py = finite(point[1]);
    if (px === undefined || py === undefined) return null;
    points.push([px, py]);
  }
  return points;
}
