/**
 * From a laid-out diagram to shapes on a board.
 *
 * What comes out is ordinary shapes — the same ones the tools make — so a
 * generated diagram can be dragged, restyled, erased and undone exactly like a
 * drawn one, and nothing downstream needs to know where it came from.
 *
 * Drawn in the style the caller passes — in the editor, whatever the style
 * panel is set to — so a generated box has the same stroke, sloppiness, fill
 * and font as one drawn by hand, and the panel reads its values back as the
 * presets they are. Only the colours come from the diagram itself.
 */

import type { DiagramColor, DiagramIcon } from '@canvasflow/types';
import type { Point } from '../math.js';
import { createArrow } from '../shapes/arrow.js';
import { bindingFor, outlineCrossing, resolveArrowTerminals } from '../shapes/arrow-binding.js';
import { createDiamond } from '../shapes/diamond.js';
import { createEllipse } from '../shapes/ellipse.js';
import { createImage } from '../shapes/image.js';
import { createNote } from '../shapes/note.js';
import { createRectangle } from '../shapes/rectangle.js';
import { createText } from '../shapes/text.js';
import type { ArrowShape, Shape } from '../shapes/shape.js';
import { DEFAULT_STROKE_COLOR } from '../shapes/style.js';
import {
  GROUP_PADDING,
  type LaidOutNode,
  type LaidOutText,
  type PositionedDiagram,
  type RoutedEdge,
} from './layout.js';
import {
  DEFAULT_DIAGRAM_STYLE,
  ICON_LABEL_GAP,
  INLINE_ICON_GAP,
  INLINE_ICON_INSET,
  textFontSize,
  type DiagramStyle,
} from './measure.js';
import {
  DEFAULT_DIAGRAM_COLOR,
  DIAGRAM_BOX_INK,
  DIAGRAM_NOTE_PAPER,
  DIAGRAM_PAINT,
} from './palette.js';

/** The picture for an icon, already stored or about to be. */
export interface DiagramIconImage {
  readonly fileId: string;
  readonly mimeType: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export interface DiagramShapeOptions {
  /**
   * The picture for each icon a diagram names, in the colour of the box it is
   * on. Without it, or for an icon it has no picture for, a box goes without
   * its icon and an icon node is drawn as a plain box.
   */
  readonly icons?: (icon: DiagramIcon, color: DiagramColor | undefined) => DiagramIconImage | null;
  /** How everything is drawn; the board's defaults when absent. */
  readonly style?: DiagramStyle;
  /**
   * The scale a shape drawn by hand would be given at the current zoom. The
   * whole diagram is laid out at 1 and then grown by it, strokes and words
   * included, exactly as a hand-drawn shape is.
   */
  readonly scale?: number;
}

/**
 * A seed that depends only on the node it belongs to.
 *
 * The shape factories reach for a random seed when none is given, and a random
 * seed would mean two people generating the same diagram get two different
 * boards — and a test that passes only sometimes.
 */
function seedFrom(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % 2 ** 31;
}

/** What every shape in one diagram shares: its line, sloppiness and scale. */
interface Pen {
  readonly style: DiagramStyle;
  readonly scale: number;
}

function line(pen: Pen) {
  return {
    strokeWidth: pen.style.strokeWidth,
    roughness: pen.style.roughness,
    scale: pen.scale,
  };
}

function boxFor(node: LaidOutNode, id: string, pen: Pen): Shape {
  const paint = DIAGRAM_PAINT[node.color ?? DEFAULT_DIAGRAM_COLOR];
  const common = {
    id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    seed: seedFrom(node.id),
    strokeColor: paint.stroke,
    fillColor: pen.style.filled ? paint.fill : null,
    fillStyle: pen.style.fillStyle,
    strokeStyle: pen.style.strokeStyle,
    ...line(pen),
  };
  switch (node.kind) {
    case 'ellipse':
      return createEllipse(common);
    case 'diamond':
      return createDiamond({ ...common, edges: pen.style.edges });
    default:
      return createRectangle({ ...common, edges: pen.style.edges });
  }
}

/**
 * A note for a node: its words on its paper, which fits them itself. Paper in
 * the node's colour, yellow when it has none, and dark ink on it in either
 * theme, as a note drawn by hand has.
 */
function noteShapeFor(node: LaidOutNode, id: string, pen: Pen): Shape {
  return createNote({
    id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    text: node.text,
    fontFamily: pen.style.fontFamily,
    fillColor: DIAGRAM_NOTE_PAPER[node.color ?? 'yellow'],
    strokeColor: DIAGRAM_BOX_INK,
    scale: pen.scale,
    seed: seedFrom(node.id),
  });
}

function iconFor(
  image: DiagramIconImage,
  id: string,
  box: { x: number; y: number; size: number },
  key: string,
): Shape {
  return createImage({
    id,
    x: box.x,
    y: box.y,
    width: box.size,
    height: box.size,
    fileId: image.fileId,
    mimeType: image.mimeType,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    status: 'pending',
    seed: seedFrom(key),
  });
}

function textShape(
  pen: Pen,
  input: {
    id: string;
    x: number;
    y: number;
    text: string;
    fontSize: number;
    textAlign: 'left' | 'center';
    strokeColor?: string;
    key: string;
  },
): Shape {
  return createText({
    id: input.id,
    x: input.x,
    y: input.y,
    text: input.text,
    fontSize: input.fontSize,
    fontFamily: pen.style.fontFamily,
    textAlign: input.textAlign,
    ...(input.strokeColor && { strokeColor: input.strokeColor }),
    roughness: pen.style.roughness,
    scale: pen.scale,
    seed: seedFrom(input.key),
  });
}

/** The words for a free-standing text, in its colour or the board's ink. */
function noteFor(text: LaidOutText, id: string, pen: Pen): Shape {
  return textShape(pen, {
    id,
    x: text.x,
    y: text.y,
    text: text.label,
    fontSize: textFontSize(pen.style, text.size),
    textAlign: 'left',
    ...(text.color && { strokeColor: DIAGRAM_PAINT[text.color].stroke }),
    key: `${text.id}:text`,
  });
}

/**
 * Where an arrow meets what it is attached to: the end of its route carried on
 * along the last run until it reaches the shape's outline. A route ends on the
 * box around a node, and for a diamond, an ellipse or a rounded corner that is
 * short of the line actually drawn.
 */
function meetOutline(target: Shape, end: Point, from: Point): Point {
  const dx = end.x - from.x;
  const dy = end.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return end;
  const reach = 'width' in target ? target.width + target.height : 0;
  const far = { x: end.x + (dx / length) * reach, y: end.y + (dy / length) * reach };
  return outlineCrossing(target, from, far) ?? end;
}

/**
 * A route with points added along it so that its longest run is the middle
 * one, which is where an arrow's label is drawn.
 *
 * The label sits at the middle of the arrow's points, counted, not measured;
 * on a route with bends that can be a corner or a short jog, where the words
 * would sit on the lines. The points added lie on the runs they split, so the
 * route looks the same.
 */
function centredOnLongestRun(route: readonly Point[]): Point[] {
  const points = [...route];
  let longest = 0;
  let length = -1;
  for (let i = 0; i + 1 < points.length; i++) {
    const run = Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
    if (run > length) {
      length = run;
      longest = i;
    }
  }
  const halfway = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let before = longest;
  let after = points.length - 2 - longest;
  while (before < after) {
    points.splice(1, 0, halfway(points[0]!, points[1]!));
    before++;
  }
  while (after < before) {
    const end = points.length - 1;
    points.splice(end, 0, halfway(points[end - 1]!, points[end]!));
    after++;
  }
  return points;
}

function arrowFor(
  edge: RoutedEdge,
  id: string,
  from: Shape,
  to: Shape,
  shapesById: ReadonlyMap<string, Shape>,
  pen: Pen,
): ArrowShape {
  const dir = edge.dir ?? 'forward';
  const head = pen.style.arrowhead === 'none' ? 'arrow' : pen.style.arrowhead;
  const style = {
    ...line(pen),
    strokeStyle: edge.style ?? pen.style.strokeStyle,
    startArrowhead: dir === 'both' ? head : ('none' as const),
    endArrowhead: dir === 'none' ? ('none' as const) : head,
    label: edge.label,
    seed: seedFrom(`${edge.from}->${edge.to}`),
  };

  let route: Point[];
  let precise: boolean;
  if (edge.route && edge.route.length >= 2) {
    route = [...edge.route];
    route[0] = meetOutline(from, route[0]!, route[1]!);
    route[route.length - 1] = meetOutline(to, route[route.length - 1]!, route[route.length - 2]!);
    if (edge.label) route = centredOnLongestRun(route);
    precise = true;
  } else {
    // No route worked out: aim at the middle of each box and let the binding
    // stop the arrow at whichever edge faces the other, re-aiming as either
    // is dragged.
    route = [centreOf(from), centreOf(to)];
    precise = false;
  }

  const startBinding = bindingFor(from, route[0]!, precise);
  const endBinding = bindingFor(to, route[route.length - 1]!, precise);
  const origin = route[0]!;
  const provisional = createArrow({
    id,
    x: origin.x,
    y: origin.y,
    points: route.map((point) => [point.x - origin.x, point.y - origin.y] as const),
    startBinding,
    endBinding,
    ...style,
  });

  // Ask the binding rules where the ends actually land, then store that, so
  // the arrow's own points are already right the first time it is drawn — a
  // preview never goes through the editor's binding pass.
  const { start, end } = resolveArrowTerminals(provisional, shapesById);
  const middle = route.slice(1, -1);
  return createArrow({
    id,
    x: start.x,
    y: start.y,
    points: [start, ...middle, end].map((point) => [point.x - start.x, point.y - start.y] as const),
    startBinding,
    endBinding,
    ...style,
  });
}

function centreOf(shape: Shape): Point {
  return 'width' in shape
    ? { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
    : { x: shape.x, y: shape.y };
}

/** A laid-out diagram grown by `factor` about the origin, words and icons with it. */
function scaled(diagram: PositionedDiagram, factor: number): PositionedDiagram {
  if (factor === 1) return diagram;
  const at = <T extends { x: number; y: number }>(item: T) => ({
    ...item,
    x: item.x * factor,
    y: item.y * factor,
  });
  return {
    nodes: diagram.nodes.map((node) => ({
      ...at(node),
      width: node.width * factor,
      height: node.height * factor,
      labelWidth: node.labelWidth * factor,
      labelHeight: node.labelHeight * factor,
      iconSize: node.iconSize * factor,
    })),
    edges: diagram.edges.map((edge) =>
      edge.route ? { ...edge, route: edge.route.map((point) => at(point)) } : edge,
    ),
    groups: diagram.groups.map((group) => ({
      ...at(group),
      width: group.width * factor,
      height: group.height * factor,
    })),
    texts: diagram.texts.map((text) => ({
      ...at(text),
      width: text.width * factor,
      height: text.height * factor,
    })),
  };
}

/**
 * Convert a laid-out diagram into shapes.
 *
 * Order is z-order: groups at the back, then boxes and icons, then the arrows
 * between them, then words on top. `genId` supplies the ids so the caller
 * keeps whatever guarantees it needs about uniqueness across a board.
 *
 * A group is an ordinary box with its name written inside the top, not a
 * frame: it takes every style the panel offers, as the boxes in it do.
 */
export function diagramToShapes(
  laidOut: PositionedDiagram,
  genId: () => string,
  options: DiagramShapeOptions = {},
): Shape[] {
  const pen: Pen = { style: options.style ?? DEFAULT_DIAGRAM_STYLE, scale: options.scale ?? 1 };
  const positioned = scaled(laidOut, pen.scale);
  const k = pen.scale;
  // Words on a solid fill keep a dark ink, since the fill stays pale on a dark
  // board; on a hatched or empty box they follow the board, as drawn text does.
  const boxInk =
    pen.style.filled && pen.style.fillStyle === 'solid' ? DIAGRAM_BOX_INK : DEFAULT_STROKE_COLOR;

  const groups: Shape[] = [];
  const words: Shape[] = [];
  for (const group of positioned.groups) {
    const paint = DIAGRAM_PAINT[group.color ?? DEFAULT_DIAGRAM_COLOR];
    groups.push(
      createRectangle({
        id: genId(),
        x: group.x,
        y: group.y,
        width: group.width,
        height: group.height,
        strokeColor: paint.stroke,
        fillColor: paint.tint,
        fillStyle: 'solid',
        strokeStyle: pen.style.strokeStyle,
        edges: pen.style.edges,
        ...line(pen),
        seed: seedFrom(`${group.id}:group`),
      }),
    );
    words.push(
      textShape(pen, {
        id: genId(),
        x: group.x + GROUP_PADDING * k,
        y: group.y + 10 * k,
        text: group.label,
        fontSize: pen.style.fontSize,
        textAlign: 'left',
        strokeColor: paint.stroke,
        key: `${group.id}:name`,
      }),
    );
  }

  const bodies: Shape[] = [];
  const attachTo = new Map<string, Shape>();

  for (const node of positioned.nodes) {
    const image = node.icon ? (options.icons?.(node.icon, node.color) ?? null) : null;

    if (node.kind === 'icon' && image) {
      const icon = iconFor(image, genId(), { x: node.x, y: node.y, size: node.width }, node.id);
      bodies.push(icon);
      attachTo.set(node.id, icon);
      words.push(
        textShape(pen, {
          id: genId(),
          x: node.x + node.width / 2,
          y: node.y + node.height + ICON_LABEL_GAP * k,
          text: node.label,
          fontSize: pen.style.fontSize,
          textAlign: 'center',
          key: `${node.id}:label`,
        }),
      );
      continue;
    }

    if (node.kind === 'note') {
      const note = noteShapeFor(node, genId(), pen);
      bodies.push(note);
      attachTo.set(node.id, note);
      continue;
    }

    const box = boxFor(node, genId(), pen);
    bodies.push(box);
    attachTo.set(node.id, box);

    const withIcon = image !== null && node.kind === 'rectangle';
    if (withIcon) {
      bodies.push(
        iconFor(
          image,
          genId(),
          {
            x: node.x + INLINE_ICON_INSET * k,
            y: node.y + (node.height - node.iconSize) / 2,
            size: node.iconSize,
          },
          `${node.id}:icon`,
        ),
      );
    }
    const textLeft = node.x + (INLINE_ICON_INSET + INLINE_ICON_GAP) * k + node.iconSize;
    words.push(
      textShape(pen, {
        id: genId(),
        // Centred text anchors on x, so this is the middle of the box, not
        // its edge; beside an icon the words start after it instead.
        x: withIcon ? textLeft : node.x + node.width / 2,
        y: node.y + (node.height - node.labelHeight) / 2,
        text: node.label,
        fontSize: pen.style.fontSize,
        textAlign: withIcon ? 'left' : 'center',
        strokeColor: boxInk,
        key: `${node.id}:label`,
      }),
    );
  }

  for (const text of positioned.texts) words.push(noteFor(text, genId(), pen));

  const shapesById = new Map(bodies.map((shape) => [shape.id, shape]));
  const arrows: Shape[] = [];
  for (const edge of positioned.edges) {
    const from = attachTo.get(edge.from);
    const to = attachTo.get(edge.to);
    // collectDiagram drops edges that name a missing node, so this is a guard
    // for callers building a diagram by hand rather than an expected branch.
    if (!from || !to) continue;
    arrows.push(arrowFor(edge, genId(), from, to, shapesById, pen));
  }

  return [...groups, ...bodies, ...arrows, ...words];
}
