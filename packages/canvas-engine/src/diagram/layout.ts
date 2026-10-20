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

import { measureTextWidth } from '../utils/text-measure.js';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from '../shapes/text.js';
import type { DiagramEdge, DiagramIR, DiagramNode } from './ir.js';

/** Space around the label inside a box. */
const PADDING_X = 28;
const PADDING_Y = 20;

const MIN_WIDTH = 104;
const MIN_HEIGHT = 56;

/** Where a label starts wrapping rather than stretching its box. */
const WRAP_WIDTH = 200;

const LINE_HEIGHT = 1.2;

/**
 * A diamond's corners cut into its box, so a label that fits the box does not
 * fit the shape. Growing the box is cheaper than measuring the rhombus.
 */
const DIAMOND_INFLATION = 1.45;

/** Between one rank and the next, and between neighbours in a rank. */
const RANK_GAP = 96;
const SIBLING_GAP = 52;

/** Sweeps of the crossing-reduction and coordinate passes. */
const ORDERING_PASSES = 4;
const REFINEMENT_PASSES = 4;

export interface LaidOutNode extends DiagramNode {
  /** The label after wrapping, newline-separated. */
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PositionedDiagram {
  readonly nodes: readonly LaidOutNode[];
  readonly edges: readonly DiagramEdge[];
}

function fontString(): string {
  return `${DEFAULT_FONT_SIZE}px ${DEFAULT_FONT_FAMILY}`;
}

/**
 * Break a label across lines at word boundaries.
 *
 * A word longer than the wrap width is left alone rather than split: a hyphen
 * inserted into somebody's identifier is worse than a wide box.
 */
function wrapLabel(text: string, font: string): { label: string; width: number; lines: number } {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { label: text, width: 0, lines: 1 };

  const lines: string[] = [];
  let current = words[0]!;

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]!}`;
    if (measureTextWidth(candidate, font) <= WRAP_WIDTH) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);

  let width = 0;
  for (const line of lines) {
    const w = measureTextWidth(line, font);
    if (w > width) width = w;
  }

  return { label: lines.join('\n'), width, lines: lines.length };
}

interface SizedNode extends DiagramNode {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

function sizeNode(node: DiagramNode, font: string): SizedNode {
  const { label, width: textWidth, lines } = wrapLabel(node.text, font);
  const textHeight = lines * DEFAULT_FONT_SIZE * LINE_HEIGHT;

  const inflation = node.kind === 'diamond' ? DIAMOND_INFLATION : 1;
  const width = Math.max(MIN_WIDTH, Math.round((textWidth + PADDING_X * 2) * inflation));
  const height = Math.max(MIN_HEIGHT, Math.round((textHeight + PADDING_Y * 2) * inflation));

  return { ...node, label, width, height };
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
 * Lay a diagram out.
 *
 * Nodes with no edges at all still get a place — an orphan is usually a node
 * whose edge has not arrived yet, and dropping it would make the preview
 * flicker as the stream fills in.
 */
export function layoutDiagram(ir: DiagramIR): PositionedDiagram {
  if (ir.nodes.length === 0) return { nodes: [], edges: [] };

  const font = fontString();
  const sized = new Map<string, SizedNode>();
  for (const node of ir.nodes) sized.set(node.id, sizeNode(node, font));

  const nodeIds = ir.nodes.map((n) => n.id);
  const backEdges = findBackEdges(nodeIds, ir.edges);
  const rankOf = assignRanks(nodeIds, ir.edges, backEdges);

  const depth = Math.max(...nodeIds.map((id) => rankOf.get(id) ?? 0)) + 1;
  const ranks: string[][] = Array.from({ length: depth }, () => []);
  for (const id of nodeIds) ranks[rankOf.get(id) ?? 0]!.push(id);

  // Which side of a box lies along a rank and which runs down the graph
  // depends on the direction: sideways, a rank is a column, so boxes in it
  // stack by height and the column is as wide as its widest box.
  const acrossOf = (id: string) =>
    ir.direction === 'TB' ? sized.get(id)!.width : sized.get(id)!.height;
  const downOf = (id: string) =>
    ir.direction === 'TB' ? sized.get(id)!.height : sized.get(id)!.width;

  const ordered = orderRanks(ranks, ir.edges);
  const centre = assignPositions(ordered, acrossOf, ir.edges);

  // The across-axis is now settled; walk the ranks to place the down-axis,
  // giving each rank the depth of its deepest member.
  const laidOut: LaidOutNode[] = [];
  let cursor = 0;

  for (const rank of ordered) {
    const deepest = Math.max(...rank.map(downOf));
    for (const id of rank) {
      const node = sized.get(id)!;
      const across = (centre.get(id) ?? 0) - acrossOf(id) / 2;
      const down = cursor + (deepest - downOf(id)) / 2;

      // One layout, two readings: for a left-to-right diagram the axes simply
      // swap, so ranking and ordering never need to know which way it runs.
      const x = ir.direction === 'TB' ? across : down;
      const y = ir.direction === 'TB' ? down : across;

      laidOut.push({
        id: node.id,
        kind: node.kind,
        text: node.text,
        label: node.label,
        x: Math.round(x),
        y: Math.round(y),
        width: node.width,
        height: node.height,
      });
    }
    cursor += deepest + RANK_GAP;
  }

  return { nodes: normaliseOrigin(laidOut), edges: ir.edges };
}

/** Shift everything so the diagram starts at the origin. */
function normaliseOrigin(nodes: readonly LaidOutNode[]): LaidOutNode[] {
  let minX = Infinity;
  let minY = Infinity;
  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
  }
  if (minX === 0 && minY === 0) return [...nodes];
  return nodes.map((node) => ({ ...node, x: node.x - minX, y: node.y - minY }));
}
