/**
 * The full layout: groups arranged as regions, arrows routed around boxes.
 *
 * Done by ELK's layered algorithm, which places a group's members inside it
 * rather than drawing a box round wherever they fell, and routes every arrow in
 * right-angled runs that go round boxes instead of through them. That is most
 * of the difference between a diagram that looks generated and one that looks
 * drawn by someone careful.
 *
 * ELK itself is not a dependency of the engine. It is large, so the caller
 * loads it when a diagram is first drawn and hands it in, and the engine only
 * describes the graph and reads the answer back.
 */

import type { Point } from '../math.js';
import { DEFAULT_FONT_FAMILY } from '../shapes/text.js';
import { measureTextWidth } from '../utils/text-measure.js';
import type { DiagramEdge, DiagramGroup, DiagramIR, DiagramNode, DiagramText } from './ir.js';
import {
  GROUP_PADDING,
  extentOf,
  placeTitles,
  shift,
  type LaidOutGroup,
  type LaidOutNode,
  type LaidOutText,
  type PositionedDiagram,
  type RoutedEdge,
} from './layout.js';
import {
  DEFAULT_DIAGRAM_STYLE,
  EDGE_LABEL_FONT_SIZE,
  ICON_LABEL_GAP,
  diagramFont,
  groupNameRoom,
  sizeNode,
  sizeText,
  wrapText,
  type DiagramStyle,
  type SizedText,
} from './measure.js';

/** The part of an ELK graph this module writes and reads. */
export interface ElkGraphNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  labels?: Array<{ text: string; width: number; height: number }>;
  children?: ElkGraphNode[];
  edges?: ElkGraphEdge[];
}

export interface ElkGraphEdge {
  id: string;
  sources: string[];
  targets: string[];
  labels?: Array<{ text: string; width: number; height: number }>;
  sections?: Array<{ startPoint: Point; endPoint: Point; bendPoints?: Point[] }>;
}

/** What `new ELK()` from elkjs gives: a layout of a graph, answered later. */
export interface ElkLike {
  layout(graph: ElkGraphNode): Promise<ElkGraphNode>;
}

/**
 * Spacing, in board units. Set on every graph that has children, since ELK
 * reads them from the graph a node is laid out in rather than from the root.
 */
const SPACING: Record<string, string> = {
  'elk.spacing.nodeNode': '36',
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.spacing.edgeNode': '20',
  'elk.spacing.edgeEdge': '12',
  'elk.layered.spacing.edgeNodeBetweenLayers': '20',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
  'elk.spacing.labelNode': String(ICON_LABEL_GAP),
  'elk.spacing.edgeLabel': '4',
  'elk.spacing.componentComponent': '64',
};

const ROOT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  // Every coordinate in the answer relative to the root, so nothing has to be
  // added up through the groups.
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  // The order things were described in is usually the order they happen in;
  // kept where it costs no crossings.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'false',
  'elk.edgeLabels.placement': 'CENTER',
  'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
  ...SPACING,
};

/** Inside a group's box, round what stands in it; the top also holds its name. */
function groupOptions(style: DiagramStyle): Record<string, string> {
  const top = groupNameRoom(style) + GROUP_PADDING;
  return {
    'elk.padding': `[top=${top},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
    ...SPACING,
  };
}

/** Ids in ELK's graph, kept apart by kind so a node and a group may share a name. */
const nodeKey = (id: string) => `n:${id}`;
const textKey = (id: string) => `t:${id}`;
const groupKey = (id: string) => `g:${id}`;

/** Every node in an answered graph, by id, however deep it sits. */
function flatten(graph: ElkGraphNode, into = new Map<string, ElkGraphNode>()) {
  for (const child of graph.children ?? []) {
    into.set(child.id, child);
    flatten(child, into);
  }
  return into;
}

/** A run of points with the stops that turn no corner taken out. */
function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) continue;
    const before = out[out.length - 2];
    if (
      last &&
      before &&
      ((Math.abs(before.x - last.x) < 0.5 && Math.abs(last.x - point.x) < 0.5) ||
        (Math.abs(before.y - last.y) < 0.5 && Math.abs(last.y - point.y) < 0.5))
    ) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out;
}

/**
 * The pieces of a diagram that nothing joins: separate sets of boxes with no
 * arrow and no group between them. Each is laid out on its own and the pieces
 * are then arranged together, which keeps a side pipeline under the main flow
 * rather than strung out beside it.
 */
function connectedParts(ir: DiagramIR, notes: readonly SizedText[]): DiagramIR[] {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(key, root);
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));

  for (const node of ir.nodes) parent.set(nodeKey(node.id), nodeKey(node.id));
  for (const note of notes) parent.set(textKey(note.id), textKey(note.id));
  for (const group of ir.groups) parent.set(groupKey(group.id), groupKey(group.id));
  for (const node of ir.nodes) if (node.group) join(nodeKey(node.id), groupKey(node.group));
  for (const note of notes) if (note.group) join(textKey(note.id), groupKey(note.group));
  for (const edge of ir.edges) join(nodeKey(edge.from), nodeKey(edge.to));

  // In the order each part first appears, which is the order it was described.
  const parts = new Map<
    string,
    { nodes: DiagramNode[]; texts: DiagramText[]; groups: DiagramGroup[]; edges: DiagramEdge[] }
  >();
  const partOf = (key: string) => {
    const root = find(key);
    let part = parts.get(root);
    if (!part) {
      part = { nodes: [], texts: [], groups: [], edges: [] };
      parts.set(root, part);
    }
    return part;
  };
  for (const node of ir.nodes) partOf(nodeKey(node.id)).nodes.push(node);
  for (const note of ir.texts) if (note.size !== 'title') partOf(textKey(note.id)).texts.push(note);
  for (const group of ir.groups) partOf(groupKey(group.id)).groups.push(group);
  for (const edge of ir.edges) partOf(nodeKey(edge.from)).edges.push(edge);

  return [...parts.values()].map((part) => ({ direction: ir.direction, ...part }));
}

/** One connected piece of a diagram, laid out by ELK where it lands. */
async function layoutPart(
  ir: DiagramIR,
  elk: ElkLike,
  style: DiagramStyle,
): Promise<PositionedDiagram> {
  const sized = ir.nodes.map((node) => sizeNode(node, style));
  const notes = ir.texts.map((text) => sizeText(text, style));

  const groupChildren = new Map<string, ElkGraphNode[]>(ir.groups.map((group) => [group.id, []]));
  const loose: ElkGraphNode[] = [];
  const home = (group: string | undefined) =>
    group !== undefined ? (groupChildren.get(group) ?? loose) : loose;

  for (const node of sized) {
    home(node.group).push(
      node.kind === 'icon'
        ? {
            id: nodeKey(node.id),
            width: node.width,
            height: node.height,
            // The words hang under the icon, outside the part arrows meet, and
            // ELK keeps room for them.
            labels: [{ text: node.label, width: node.labelWidth, height: node.labelHeight }],
            layoutOptions: { 'elk.nodeLabels.placement': 'OUTSIDE V_BOTTOM H_CENTER' },
          }
        : { id: nodeKey(node.id), width: node.width, height: node.height },
    );
  }
  for (const note of notes) {
    home(note.group).push({ id: textKey(note.id), width: note.width, height: note.height });
  }

  const graph: ElkGraphNode = {
    id: 'root',
    layoutOptions: {
      ...ROOT_OPTIONS,
      'elk.direction': ir.direction === 'LR' ? 'RIGHT' : 'DOWN',
    },
    children: [
      ...ir.groups.map((group) => ({
        id: groupKey(group.id),
        layoutOptions: {
          ...groupOptions(style),
          // At least as wide as its name.
          'elk.nodeSize.constraints': 'MINIMUM_SIZE',
          'elk.nodeSize.minimum': `(${Math.ceil(measureTextWidth(group.label, diagramFont(style.fontSize, style.fontFamily))) + GROUP_PADDING * 2}, 0)`,
        },
        children: groupChildren.get(group.id) ?? [],
      })),
      ...loose,
    ],
    edges: ir.edges.map((edge, index) => {
      const label = edge.label
        ? wrapText(edge.label, EDGE_LABEL_FONT_SIZE, 160, DEFAULT_FONT_FAMILY)
        : null;
      return {
        id: `e:${index}`,
        sources: [nodeKey(edge.from)],
        targets: [nodeKey(edge.to)],
        ...(label && { labels: [{ text: label.label, width: label.width, height: label.height }] }),
      };
    }),
  };

  const answer = await elk.layout(graph);
  const placed = flatten(answer);
  const at = (key: string): Point => {
    const node = placed.get(key);
    return { x: node?.x ?? 0, y: node?.y ?? 0 };
  };

  const nodes: LaidOutNode[] = sized.map((node) => ({ ...node, ...at(nodeKey(node.id)) }));
  const texts: LaidOutText[] = notes.map((note) => ({ ...note, ...at(textKey(note.id)) }));
  const groups: LaidOutGroup[] = ir.groups.map((group) => {
    const box = placed.get(groupKey(group.id));
    return {
      ...group,
      x: box?.x ?? 0,
      y: box?.y ?? 0,
      width: box?.width ?? 0,
      height: box?.height ?? 0,
    };
  });

  const routed = new Map((answer.edges ?? []).map((edge) => [edge.id, edge]));
  const edges: RoutedEdge[] = ir.edges.map((edge, index) => {
    const section = routed.get(`e:${index}`)?.sections?.[0];
    if (!section) return edge;
    return {
      ...edge,
      route: simplify([section.startPoint, ...(section.bendPoints ?? []), section.endPoint]),
    };
  });

  return { nodes, edges, groups, texts };
}

/** Between the pieces of a diagram, across and down. */
const PART_GAP = 72;

/**
 * Arrange the laid-out pieces: the biggest first, the rest in rows beneath it
 * in the order they were described, each row no wider than the widest piece.
 */
function packParts(parts: readonly PositionedDiagram[]): PositionedDiagram {
  const sized = parts
    .map((part) => ({ part, box: extentOf(part) }))
    .filter(
      (
        entry,
      ): entry is { part: PositionedDiagram; box: NonNullable<ReturnType<typeof extentOf>> } =>
        entry.box !== null,
    );
  if (sized.length === 0) return { nodes: [], edges: [], groups: [], texts: [] };

  const count = (part: PositionedDiagram) => part.nodes.length + part.texts.length;
  const main = sized.reduce((best, entry) => (count(entry.part) > count(best.part) ? entry : best));
  const rest = sized.filter((entry) => entry !== main);
  const rowWidth = Math.max(...sized.map((entry) => entry.box.width));

  const moved: PositionedDiagram[] = [shift(main.part, -main.box.x, -main.box.y)];
  let x = 0;
  let y = main.box.height + PART_GAP;
  let rowHeight = 0;
  for (const { part, box } of rest) {
    if (x > 0 && x + box.width > rowWidth) {
      x = 0;
      y += rowHeight + PART_GAP;
      rowHeight = 0;
    }
    moved.push(shift(part, x - box.x, y - box.y));
    x += box.width + PART_GAP;
    rowHeight = Math.max(rowHeight, box.height);
  }

  return {
    nodes: moved.flatMap((part) => part.nodes),
    edges: moved.flatMap((part) => part.edges),
    groups: moved.flatMap((part) => part.groups),
    texts: moved.flatMap((part) => part.texts),
  };
}

/**
 * Lay a diagram out with ELK.
 *
 * Rejects only if ELK does; a caller that wants something on screen regardless
 * falls back to `layoutDiagram`.
 */
export async function layoutDiagramWithElk(
  ir: DiagramIR,
  elk: ElkLike,
  style: DiagramStyle = DEFAULT_DIAGRAM_STYLE,
): Promise<PositionedDiagram> {
  const titles = ir.texts
    .filter((text) => text.size === 'title')
    .map((text) => sizeText(text, style));
  const notes = ir.texts
    .filter((text) => text.size !== 'title')
    .map((text) => sizeText(text, style));
  if (ir.nodes.length === 0 && notes.length === 0) {
    return placeTitles({ nodes: [], edges: [], groups: [], texts: [] }, titles);
  }

  const parts = await Promise.all(
    connectedParts(ir, notes).map((part) => layoutPart(part, elk, style)),
  );
  return placeTitles(packParts(parts), titles);
}
