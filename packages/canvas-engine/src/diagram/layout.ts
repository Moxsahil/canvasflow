/**
 * Turning a graph into geometry.
 *
 * Layered layout: every node gets a rank from how far it sits down the graph,
 * ranks become rows, and nodes are ordered within a row to keep the lines
 * between rows from crossing. It is the arrangement people already draw
 * flowcharts in by hand, which is the point — a generated diagram should look
 * like one somebody made.
 *
 * Everything here is a pure function of the diagram and the measured text, so
 * two people generating the same description get the same board, and a layout
 * can be re-run after the sizing rules change without regenerating anything.
 */

import type { Point } from '../math.js';
import {
  DEFAULT_DIAGRAM_STYLE,
  ICON_LABEL_GAP,
  groupNameRoom,
  sizeNode,
  sizeText,
  type DiagramStyle,
  type SizedNode,
  type SizedText,
} from './measure.js';
import type { DiagramEdge, DiagramGroup, DiagramIR } from './ir.js';

/** Between one rank and the next, and between neighbours in a rank. */
const RANK_GAP = 96;
const SIBLING_GAP = 52;

/** Sweeps of the crossing-reduction and coordinate passes. */
const ORDERING_PASSES = 4;
const REFINEMENT_PASSES = 4;

/** Room inside a group's frame around what stands in it. */
export const GROUP_PADDING = 24;
/** Between a title and the top of the diagram under it. */
const TITLE_GAP = 48;

/**
 * A node in place. `x`, `y`, `width` and `height` are the part arrows attach
 * to — the box, or an icon node's icon, whose words hang below it.
 */
export interface LaidOutNode extends SizedNode {
  readonly x: number;
  readonly y: number;
}

export interface LaidOutText extends SizedText {
  readonly x: number;
  readonly y: number;
}

export interface LaidOutGroup extends DiagramGroup {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RoutedEdge extends DiagramEdge {
  /**
   * The way the arrow goes, end to end, when the layout worked one out. Absent,
   * the arrow runs straight from one box to the other.
   */
  readonly route?: readonly Point[];
}

export interface PositionedDiagram {
  readonly nodes: readonly LaidOutNode[];
  readonly edges: readonly RoutedEdge[];
  readonly groups: readonly LaidOutGroup[];
  readonly texts: readonly LaidOutText[];
}

/** The room a node takes up on the board, its words included. */
export function footprintOf(node: SizedNode): { width: number; height: number } {
  if (node.kind !== 'icon') return { width: node.width, height: node.height };
  return {
    width: Math.max(node.width, node.labelWidth),
    height: node.height + ICON_LABEL_GAP + node.labelHeight,
  };
}

/**
 * One edge, as a string that cannot be confused with another.
 *
 * Joining two ids with a separator means picking a character that can never
 * appear in one; encoding them as JSON sidesteps the question, and stays
 * readable in a debugger.
 */
function edgeKey(from: string, to: string): string {
  return JSON.stringify([from, to]);
}

/**
 * The edges that point backwards.
 *
 * A cycle has no layering, so the edges that close one are ignored while ranks
 * are assigned. They are still drawn — only the ranking pretends they are not
 * there, which is what stops a loop from ranking forever.
 */
function findBackEdges(nodeIds: readonly string[], edges: readonly DiagramEdge[]): Set<string> {
  const outgoing = new Map<string, DiagramEdge[]>();
  for (const id of nodeIds) outgoing.set(id, []);
  for (const edge of edges) outgoing.get(edge.from)?.push(edge);

  const back = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();

  // Iterative so a long chain cannot overflow the stack.
  for (const start of nodeIds) {
    if (state.has(start)) continue;

    const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }];
    state.set(start, 'visiting');

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const edgesOut = outgoing.get(frame.id) ?? [];

      if (frame.next >= edgesOut.length) {
        state.set(frame.id, 'done');
        stack.pop();
        continue;
      }

      const edge = edgesOut[frame.next++]!;
      const seen = state.get(edge.to);
      if (seen === 'visiting') {
        back.add(edgeKey(edge.from, edge.to));
      } else if (seen === undefined) {
        state.set(edge.to, 'visiting');
        stack.push({ id: edge.to, next: 0 });
      }
    }
  }

  return back;
}

/** How far down the graph each node sits, counting the longest way in. */
function assignRanks(
  nodeIds: readonly string[],
  edges: readonly DiagramEdge[],
  backEdges: ReadonlySet<string>,
): Map<string, number> {
  const forward = edges.filter((e) => !backEdges.has(edgeKey(e.from, e.to)));

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodeIds) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of forward) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const id of nodeIds) {
    rank.set(id, 0);
    if ((incoming.get(id) ?? 0) === 0) queue.push(id);
  }

  // Topological order, keeping the deepest arrival — so a node sits below
  // everything that reaches it rather than beside the first one.
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]!;
    const here = rank.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      if (here + 1 > (rank.get(next) ?? 0)) rank.set(next, here + 1);
      const remaining = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  return rank;
}

/**
 * Order nodes within each rank to reduce crossings.
 *
 * Repeated barycentre sweeps: a node moves to the average position of the nodes
 * it connects to in the rank before (going down) or after (going up). Cheap,
 * and good enough that the result reads as deliberate.
 */
function orderRanks(ranks: string[][], edges: readonly DiagramEdge[]): string[][] {
  const neighboursAbove = new Map<string, string[]>();
  const neighboursBelow = new Map<string, string[]>();
  for (const edge of edges) {
    if (!neighboursAbove.has(edge.to)) neighboursAbove.set(edge.to, []);
    neighboursAbove.get(edge.to)!.push(edge.from);
    if (!neighboursBelow.has(edge.from)) neighboursBelow.set(edge.from, []);
    neighboursBelow.get(edge.from)!.push(edge.to);
  }

  const ordered = ranks.map((r) => [...r]);

  const sweep = (from: 'above' | 'below') => {
    const indexOf = new Map<string, number>();
    for (const rank of ordered) {
      rank.forEach((id, i) => indexOf.set(id, i));
    }

    const rankOrder = from === 'above' ? ordered : [...ordered].reverse();
    for (const rank of rankOrder) {
      const neighbours = from === 'above' ? neighboursAbove : neighboursBelow;
      const barycentre = new Map<string, number>();

      rank.forEach((id, position) => {
        const linked = neighbours.get(id) ?? [];
        const positions = linked
          .map((other) => indexOf.get(other))
          .filter((p): p is number => p !== undefined);
        // A node with nothing to line up against keeps where it is, so the
        // sort stays stable instead of drifting.
        barycentre.set(
          id,
          positions.length === 0
            ? position
            : positions.reduce((a, b) => a + b, 0) / positions.length,
        );
      });

      rank.sort((a, b) => (barycentre.get(a) ?? 0) - (barycentre.get(b) ?? 0));
      rank.forEach((id, i) => indexOf.set(id, i));
    }
  };

  for (let pass = 0; pass < ORDERING_PASSES; pass++) {
    sweep(pass % 2 === 0 ? 'above' : 'below');
  }

  return ordered;
}

/**
 * Place each rank along its axis, then nudge nodes toward what they connect to.
 *
 * The nudging is what turns an evenly spaced row into something that looks
 * arranged: a node with one parent ends up under it. Each pass keeps a minimum
 * gap between neighbours, so pulling a node never puts it on top of another.
 */
function assignPositions(
  ranks: readonly string[][],
  extentOf: (id: string) => number,
  edges: readonly DiagramEdge[],
): Map<string, number> {
  const centre = new Map<string, number>();

  for (const rank of ranks) {
    let cursor = 0;
    for (const id of rank) {
      const extent = extentOf(id);
      centre.set(id, cursor + extent / 2);
      cursor += extent + SIBLING_GAP;
    }
  }

  const linked = new Map<string, string[]>();
  for (const edge of edges) {
    if (!linked.has(edge.from)) linked.set(edge.from, []);
    linked.get(edge.from)!.push(edge.to);
    if (!linked.has(edge.to)) linked.set(edge.to, []);
    linked.get(edge.to)!.push(edge.from);
  }

  for (let pass = 0; pass < REFINEMENT_PASSES; pass++) {
    for (const rank of ranks) {
      for (const id of rank) {
        const neighbours = linked.get(id) ?? [];
        // Only neighbours in other ranks say anything about where this should
        // sit; a sibling's position is the thing being decided.
        const positions = neighbours
          .filter((other) => !rank.includes(other))
          .map((other) => centre.get(other))
          .filter((p): p is number => p !== undefined);
        if (positions.length === 0) continue;

        positions.sort((a, b) => a - b);
        const mid =
          positions.length % 2 === 1
            ? positions[(positions.length - 1) / 2]!
            : (positions[positions.length / 2 - 1]! + positions[positions.length / 2]!) / 2;
        centre.set(id, mid);
      }

      // Re-separate: sort by where everything wants to be, then push right
      // whenever two boxes would touch.
      const bySeat = [...rank].sort((a, b) => (centre.get(a) ?? 0) - (centre.get(b) ?? 0));
      let limit = -Infinity;
      for (const id of bySeat) {
        const half = extentOf(id) / 2;
        const wanted = centre.get(id) ?? 0;
        const placed = Math.max(wanted, limit + half);
        centre.set(id, placed);
        limit = placed + half + SIBLING_GAP;
      }
      rank.length = 0;
      rank.push(...bySeat);
    }
  }

  return centre;
}

/**
 * Lay a diagram out, quickly and without help.
 *
 * Used where the full layout is not to hand: groups become a box around their
 * members rather than a region the members are arranged inside, and arrows run
 * straight. Nodes with no edges at all still get a place — an orphan is
 * usually a node whose edge has not arrived yet, and dropping it would make the
 * preview flicker as the stream fills in.
 */
export function layoutDiagram(
  ir: DiagramIR,
  style: DiagramStyle = DEFAULT_DIAGRAM_STYLE,
): PositionedDiagram {
  const titles = ir.texts
    .filter((text) => text.size === 'title')
    .map((text) => sizeText(text, style));
  const notes = ir.texts
    .filter((text) => text.size !== 'title')
    .map((text) => sizeText(text, style));
  if (ir.nodes.length === 0 && notes.length === 0) {
    return placeTitles({ nodes: [], edges: [], groups: [], texts: [] }, titles);
  }

  const sized = new Map<string, SizedNode>();
  for (const node of ir.nodes) sized.set(node.id, sizeNode(node, style));
  // Notes take a place in the layout as nodes with nothing attached.
  const footprints = new Map<string, { width: number; height: number }>();
  for (const node of sized.values()) footprints.set(node.id, footprintOf(node));
  const noteKey = (id: string) => JSON.stringify(['text', id]);
  for (const note of notes) footprints.set(noteKey(note.id), note);

  const nodeIds = [...footprints.keys()];
  const backEdges = findBackEdges(nodeIds, ir.edges);
  const rankOf = assignRanks(nodeIds, ir.edges, backEdges);

  const depth = Math.max(...nodeIds.map((id) => rankOf.get(id) ?? 0)) + 1;
  const ranks: string[][] = Array.from({ length: depth }, () => []);
  for (const id of nodeIds) ranks[rankOf.get(id) ?? 0]!.push(id);

  // Which side of a box lies along a rank and which runs down the graph
  // depends on the direction: sideways, a rank is a column, so boxes in it
  // stack by height and the column is as wide as its widest box.
  const acrossOf = (id: string) =>
    ir.direction === 'TB' ? footprints.get(id)!.width : footprints.get(id)!.height;
  const downOf = (id: string) =>
    ir.direction === 'TB' ? footprints.get(id)!.height : footprints.get(id)!.width;

  const ordered = orderRanks(ranks, ir.edges);
  const centre = assignPositions(ordered, acrossOf, ir.edges);

  // The across-axis is now settled; walk the ranks to place the down-axis,
  // giving each rank the depth of its deepest member.
  const placed = new Map<string, Point>();
  let cursor = 0;

  for (const rank of ordered) {
    const deepest = Math.max(...rank.map(downOf));
    for (const id of rank) {
      const across = (centre.get(id) ?? 0) - acrossOf(id) / 2;
      const down = cursor + (deepest - downOf(id)) / 2;

      // One layout, two readings: for a left-to-right diagram the axes simply
      // swap, so ranking and ordering never need to know which way it runs.
      placed.set(id, {
        x: Math.round(ir.direction === 'TB' ? across : down),
        y: Math.round(ir.direction === 'TB' ? down : across),
      });
    }
    cursor += deepest + RANK_GAP;
  }

  const nodes: LaidOutNode[] = [...sized.values()].map((node) => {
    const at = placed.get(node.id)!;
    // An icon sits centred over its words.
    const inset = (footprintOf(node).width - node.width) / 2;
    return { ...node, x: at.x + inset, y: at.y };
  });
  const texts: LaidOutText[] = notes.map((note) => ({ ...note, ...placed.get(noteKey(note.id))! }));

  const groups: LaidOutGroup[] = [];
  for (const group of ir.groups) {
    const members = [
      ...nodes
        .filter((node) => node.group === group.id)
        .map((node) => ({
          x: node.x - (footprintOf(node).width - node.width) / 2,
          y: node.y,
          ...footprintOf(node),
        })),
      ...texts.filter((text) => text.group === group.id),
    ];
    const box = enclosing(members);
    if (!box) continue;
    groups.push({
      ...group,
      x: box.x - GROUP_PADDING,
      y: box.y - GROUP_PADDING - groupNameRoom(style),
      width: box.width + GROUP_PADDING * 2,
      height: box.height + GROUP_PADDING * 2 + groupNameRoom(style),
    });
  }

  return placeTitles({ nodes, edges: ir.edges, groups, texts }, titles);
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function enclosing(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Everything a laid-out diagram covers, words under icons included. */
export function extentOf(diagram: PositionedDiagram): Box | null {
  return enclosing([
    ...diagram.nodes.map((node) => ({
      x: node.x - (footprintOf(node).width - node.width) / 2,
      y: node.y,
      ...footprintOf(node),
    })),
    ...diagram.groups,
    ...diagram.texts,
    ...diagram.edges.flatMap((edge) =>
      (edge.route ?? []).map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
    ),
  ]);
}

/**
 * Put the titles above the top-left corner of the laid-out diagram, one under
 * another, then move the whole thing so it starts at the origin.
 */
export function placeTitles(
  diagram: PositionedDiagram,
  titles: readonly SizedText[],
): PositionedDiagram {
  const extent = extentOf(diagram) ?? { x: 0, y: 0, width: 0, height: 0 };
  const height = titles.reduce((sum, title) => sum + title.height, 0);
  let y = extent.y - (titles.length > 0 ? height + TITLE_GAP : 0);
  const placed: LaidOutText[] = titles.map((title) => {
    const text = { ...title, x: extent.x, y };
    y += title.height;
    return text;
  });
  return normaliseOrigin({ ...diagram, texts: [...placed, ...diagram.texts] });
}

/** Shift everything so the diagram starts at the origin. */
function normaliseOrigin(diagram: PositionedDiagram): PositionedDiagram {
  const extent = extentOf(diagram);
  if (!extent || (extent.x === 0 && extent.y === 0)) return diagram;
  return shift(diagram, -extent.x, -extent.y);
}

/** The same diagram moved by `dx`, `dy`. */
export function shift(diagram: PositionedDiagram, dx: number, dy: number): PositionedDiagram {
  return {
    nodes: diagram.nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy })),
    edges: diagram.edges.map((edge) =>
      edge.route
        ? { ...edge, route: edge.route.map((point) => ({ x: point.x + dx, y: point.y + dy })) }
        : edge,
    ),
    groups: diagram.groups.map((group) => ({ ...group, x: group.x + dx, y: group.y + dy })),
    texts: diagram.texts.map((text) => ({ ...text, x: text.x + dx, y: text.y + dy })),
  };
}
