import {
  frameLabel,
  isArrow,
  isDiamond,
  isEllipse,
  isFrame,
  isImage,
  isRectangle,
  isText,
  shapeBounds,
  type ArrowShape,
  type DiamondShape,
  type EllipseShape,
  type RectangleShape,
  type Shape,
} from '@canvasflow/canvas-engine';

/** The shapes a flowchart's nodes are drawn from. */
type Box = RectangleShape | EllipseShape | DiamondShape;

function isBox(shape: Shape): shape is Box {
  return isRectangle(shape) || isEllipse(shape) || isDiamond(shape);
}

interface Edge {
  readonly arrow: ArrowShape;
  readonly from: Shape;
  readonly to: Shape;
}

/**
 * The box each text stands in: the smallest one its middle lies inside.
 *
 * A box holds no words of its own, so the writing laid over it is what it
 * says — its label in the chart — and an arrow tied to that writing is an
 * arrow to the box.
 */
function textsInBoxes(shapes: readonly Shape[]): Map<string, Box> {
  const held = new Map<string, Box>();
  const boxes = shapes.filter(isBox).map((box) => ({ box, bounds: shapeBounds(box) }));
  if (boxes.length === 0) return held;

  for (const text of shapes.filter(isText)) {
    const { x, y, width, height } = shapeBounds(text);
    const middle = { x: x + width / 2, y: y + height / 2 };
    let smallest: { box: Box; area: number } | null = null;
    for (const { box, bounds } of boxes) {
      const inside =
        middle.x >= bounds.x &&
        middle.x <= bounds.x + bounds.width &&
        middle.y >= bounds.y &&
        middle.y <= bounds.y + bounds.height;
      const area = bounds.width * bounds.height;
      if (inside && (!smallest || area < smallest.area)) smallest = { box, area };
    }
    if (smallest) held.set(text.id, smallest.box);
  }
  return held;
}

/**
 * The shape an arrow end is tied to, when that shape is among the ones copied:
 * the box, for writing standing in one.
 */
function boundEnd(
  id: string | undefined,
  byId: ReadonlyMap<string, Shape>,
  held: ReadonlyMap<string, Box>,
): Shape | null {
  const shape = id === undefined ? undefined : byId.get(id);
  if (!shape || isArrow(shape)) return null;
  return held.get(shape.id) ?? shape;
}

function edgesIn(
  shapes: readonly Shape[],
  byId: ReadonlyMap<string, Shape>,
  held: ReadonlyMap<string, Box>,
): Edge[] {
  const edges: Edge[] = [];
  for (const arrow of shapes.filter(isArrow)) {
    const from = boundEnd(arrow.startBinding?.shapeId, byId, held);
    const to = boundEnd(arrow.endBinding?.shapeId, byId, held);
    if (from && to) edges.push({ arrow, from, to });
  }
  return edges;
}

/**
 * Whether there is a flowchart among `shapes`: a box, or an arrow tied at
 * both ends. Exactly when `mermaidFlowchart` has something to say, without
 * laying it out.
 */
export function hasFlowchart(shapes: readonly Shape[]): boolean {
  if (shapes.some(isBox)) return true;
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  return edgesIn(shapes, byId, new Map()).length > 0;
}

/**
 * Words inside a quoted Mermaid label.
 *
 * Quoted so anything can be written — brackets and pipes are syntax outside
 * quotes. Inside them, the characters Mermaid still reads are written as its
 * entity codes: `#` first, since every code starts with one; the quote that
 * would end the label; angle brackets, which a renderer would take for HTML;
 * and a backtick, which opens a Markdown label. A line break is a `<br>`.
 */
function quoted(words: string): string {
  const escaped = words
    .trim()
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/#/g, '#35;')
        .replace(/"/g, '#quot;')
        .replace(/</g, '#lt;')
        .replace(/>/g, '#gt;')
        .replace(/`/g, '#96;'),
    )
    .join('<br>');
  // An empty label draws as the node's id, so a box with no words gets a space.
  return `"${escaped === '' ? ' ' : escaped}"`;
}

/** A node in the outline nearest the shape's own; `words` is a box's label. */
function nodeLine(id: string, shape: Shape, words: string): string {
  if (isBox(shape)) {
    const label = quoted(words);
    if (shape.kind === 'ellipse') return `${id}((${label}))`;
    if (shape.kind === 'diamond') return `${id}{${label}}`;
    return shape.edges === 'round' ? `${id}(${label})` : `${id}[${label}]`;
  }
  if (isText(shape)) return `${id}[${quoted(shape.text)}]`;
  if (isFrame(shape)) return `${id}[${quoted(frameLabel(shape))}]`;
  if (isImage(shape)) return `${id}[${quoted('Image')}]`;
  return `${id}[${quoted('')}]`;
}

/**
 * The link for one arrow: which way it points, solid or dotted, and its label.
 *
 * Mermaid draws a head at the far end only, or at both, so an arrow with its
 * one head at the start is written the other way round. Dashed and dotted are
 * both Mermaid's dotted link, the only other kind it has.
 */
function edgeLine(edge: Edge, idOf: ReadonlyMap<string, string>): string {
  const { arrow } = edge;
  const startHead = arrow.startArrowhead !== 'none';
  const endHead = arrow.endArrowhead !== 'none';
  const [from, to] = startHead && !endHead ? [edge.to, edge.from] : [edge.from, edge.to];

  const dotted = arrow.strokeStyle !== 'solid';
  const headed = startHead || endHead;
  const body = dotted ? (headed ? '-.->' : '-.-') : headed ? '-->' : '---';
  const link = startHead && endHead ? `<${body}` : body;

  const label = arrow.label.trim();
  const text = label === '' ? '' : `|${quoted(label)}|`;
  return `${idOf.get(from.id)} ${link}${text} ${idOf.get(to.id)}`;
}

function centreOf(shape: Shape): { x: number; y: number } {
  const bounds = shapeBounds(shape);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/**
 * Down the page, or across it, whichever way the diagram mostly runs: the
 * arrows' own lengths along each axis, or with no arrows, the spread of the
 * boxes.
 */
function directionOf(edges: readonly Edge[], nodes: readonly Shape[]): 'TD' | 'LR' {
  let across = 0;
  let down = 0;
  if (edges.length > 0) {
    for (const { from, to } of edges) {
      const a = centreOf(from);
      const b = centreOf(to);
      across += Math.abs(b.x - a.x);
      down += Math.abs(b.y - a.y);
    }
  } else {
    const xs = nodes.map((node) => centreOf(node).x);
    const ys = nodes.map((node) => centreOf(node).y);
    across = Math.max(...xs) - Math.min(...xs);
    down = Math.max(...ys) - Math.min(...ys);
  }
  return across > down ? 'LR' : 'TD';
}

/** Top to bottom, then left to right. Mermaid lays the chart out itself; this only makes ids read in order. */
function byReadingOrder(a: Shape, b: Shape): number {
  const first = shapeBounds(a);
  const second = shapeBounds(b);
  return first.y - second.y || first.x - second.x;
}

/**
 * The boxes and arrows among `shapes` as a Mermaid flowchart, or null when
 * there is no flowchart among them.
 *
 * Nodes are the rectangles, ellipses and diamonds, each in Mermaid's nearest
 * outline and labelled with the writing standing inside it, and anything
 * else an arrow is tied to. Edges are the arrows tied at both ends: Mermaid
 * has no arrow that stops in mid-air, so one loose at either end is left
 * out, as are lines, drawings, images and writing that neither stands in a
 * box nor has an arrow tied to it. A frame holding any of the nodes is a
 * subgraph around them; a frame an arrow points at with nothing in it is a
 * node of its own.
 *
 * Ids are made up — n1, n2… and f1, f2… in reading order — rather than taken
 * from the shapes, whose ids are neither readable nor always words Mermaid
 * accepts.
 */
export function mermaidFlowchart(shapes: readonly Shape[]): string | null {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const held = textsInBoxes(shapes);
  const edges = edgesIn(shapes, byId, held);

  // Each box's words: the writing standing in it, read top to bottom.
  const words = new Map<string, string>();
  for (const text of shapes.filter(isText).sort(byReadingOrder)) {
    const box = held.get(text.id);
    if (!box) continue;
    const before = words.get(box.id);
    words.set(box.id, before === undefined ? text.text : `${before}\n${text.text}`);
  }

  /** The nearest frame around a shape that is among the copied shapes. */
  const parentOf = (shape: Shape): Shape | null => {
    const seen = new Set<string>([shape.id]);
    let frameId = shape.frameId;
    while (frameId != null && !seen.has(frameId)) {
      seen.add(frameId);
      const frame = byId.get(frameId);
      if (frame && isFrame(frame)) return frame;
      // A frame left out of the copy: whatever holds it may still be in.
      frameId = frame?.frameId;
    }
    return null;
  };

  const nodes = new Set<Shape>(shapes.filter(isBox));
  for (const { from, to } of edges) {
    if (!isFrame(from)) nodes.add(from);
    if (!isFrame(to)) nodes.add(to);
  }

  const groups = new Set<Shape>();
  const enclose = (node: Shape) => {
    for (let frame = parentOf(node); frame && !groups.has(frame); frame = parentOf(frame)) {
      groups.add(frame);
    }
  };
  for (const node of nodes) enclose(node);
  // An arrow can point at a frame. One holding nodes is drawn as a subgraph,
  // which Mermaid lets a link end at; an empty one is a node in its place.
  for (const { from, to } of edges) {
    for (const end of [from, to]) {
      if (isFrame(end) && !groups.has(end) && !nodes.has(end)) {
        nodes.add(end);
        enclose(end);
      }
    }
  }
  if (nodes.size === 0) return null;

  const orderedNodes = [...nodes].sort(byReadingOrder);
  const orderedGroups = [...groups].sort(byReadingOrder);
  const idOf = new Map<string, string>([
    ...orderedNodes.map((node, i) => [node.id, `n${i + 1}`] as const),
    ...orderedGroups.map((frame, i) => [frame.id, `f${i + 1}`] as const),
  ]);

  const everything = [...orderedNodes, ...orderedGroups].sort(byReadingOrder);
  const rank = new Map(everything.map((shape, i) => [shape.id, i]));

  // What each subgraph holds, and what stands loose at the top (keyed null).
  const children = new Map<string | null, Shape[]>();
  for (const shape of everything) {
    const parent = parentOf(shape)?.id ?? null;
    children.set(parent, [...(children.get(parent) ?? []), shape]);
  }

  const lines = [`flowchart ${directionOf(edges, orderedNodes)}`];
  const write = (parent: string | null, depth: number) => {
    const indent = '  '.repeat(depth);
    for (const shape of children.get(parent) ?? []) {
      const id = idOf.get(shape.id)!;
      if (groups.has(shape) && isFrame(shape)) {
        lines.push(`${indent}subgraph ${id}[${quoted(frameLabel(shape))}]`);
        write(shape.id, depth + 1);
        lines.push(`${indent}end`);
      } else {
        lines.push(`${indent}${nodeLine(id, shape, words.get(shape.id) ?? '')}`);
      }
    }
  };
  write(null, 1);

  const order = (shape: Shape) => rank.get(shape.id) ?? 0;
  const sortedEdges = [...edges].sort(
    (a, b) => order(a.from) - order(b.from) || order(a.to) - order(b.to),
  );
  for (const edge of sortedEdges) lines.push(`  ${edgeLine(edge, idOf)}`);

  return lines.join('\n');
}
