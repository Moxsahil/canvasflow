import { MIND_MAP_MAX_DEPTH, MIND_MAP_TOPIC_MAX } from '@canvasflow/types';
import { isTopic, type Shape, type TopicShape } from '../shapes/shape.js';
import { mindMapForest, newChildTopic, type MindMapForest } from './tree.js';

/** One line of an outline, with the lines indented under it. */
export interface OutlineNode {
  readonly text: string;
  readonly children: readonly OutlineNode[];
}

/**
 * The most topics one paste makes. A list longer than this is cut short
 * rather than freezing the board laying out thousands of boxes.
 */
export const MAX_OUTLINE_TOPICS = 500;

/** Columns a tab stands for, when indentation is measured. */
const TAB_WIDTH = 4;

const HEADING = /^(#{1,6})\s+(.*)$/;
// A bullet, a number, then an optional checkbox — any of them, in that order.
const BULLET = /^(?:[-*+•‣◦▪▫–]\s+|\d{1,3}[.)]\s+)?(?:\[[ xX]\]\s+)?/;

function indentOf(line: string): number {
  let columns = 0;
  for (const char of line) {
    if (char === ' ') columns += 1;
    else if (char === '\t') columns += TAB_WIDTH;
    else break;
  }
  return columns;
}

interface Building {
  readonly text: string;
  readonly children: Building[];
}

/** Lines, each with how deep it sits, nested into a tree by that depth. */
function nest(lines: ReadonlyArray<{ depth: number; text: string }>): OutlineNode[] {
  const roots: Building[] = [];
  const stack: Array<{ depth: number; node: Building }> = [];
  let count = 0;
  for (const { depth, text } of lines) {
    if (count >= MAX_OUTLINE_TOPICS) break;
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const node: Building = { text, children: [] };
    const parent = stack[stack.length - 1];
    if (parent) parent.node.children.push(node);
    else roots.push(node);
    stack.push({ depth, node });
    count += 1;
  }
  return roots;
}

/**
 * Text as an outline: each line a topic, nested under the line above it that
 * is indented less.
 *
 * Takes lists as they are copied from anywhere: indented with spaces or tabs,
 * marked with bullets, numbers or checkboxes, or set out under Markdown
 * headings — a heading holds what follows it, a `##` sits under a `#`. The
 * markers themselves are dropped; only the words become topics. Blank lines
 * are passed over. Null for text with no words in it.
 */
export function parseOutline(text: string): OutlineNode[] | null {
  const mermaid = parseMermaidMindmap(text);
  if (mermaid) return mermaid;

  const lines: Array<{ depth: number; text: string }> = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.trim() === '') continue;
    const heading = HEADING.exec(raw.trim());
    if (heading) {
      // Shallower than any indented line, and one level per `#`.
      lines.push({ depth: heading[1]!.length - 7, text: heading[2]!.trim() });
      continue;
    }
    const words = raw.trim().replace(BULLET, '').trim();
    if (words === '') continue;
    lines.push({ depth: indentOf(raw), text: words });
  }
  return lines.length === 0 ? null : nest(lines);
}

/** Whether text reads as an outline at all: more than one line, nested or marked as a list. */
export function looksLikeOutline(text: string): boolean {
  if (parseMermaidMindmap(text)) return true;
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return false;
  const indents = new Set(lines.map(indentOf));
  return (
    indents.size > 1 ||
    lines.some((line) => HEADING.test(line.trim()) || BULLET.exec(line.trim())![0] !== '')
  );
}

// `id((words))`, `id[words]`, `id(words)`, `id))words((`, `id)words(`,
// `id{{words}}`, or bare words — the node forms of a Mermaid mind map.
const MERMAID_NODE =
  /^(?:[\w-]+)?\s*(?:\(\((.*)\)\)|\)\)(.*)\(\(|\{\{(.*)\}\}|\[(.*)\]|\((.*)\)|\)(.*)\()$/;

function mermaidWords(line: string): string {
  const match = MERMAID_NODE.exec(line);
  const words = match ? match.slice(1).find((group) => group !== undefined) : line;
  // A quoted label, Markdown-string backticks and all, is its words.
  return (words ?? line)
    .trim()
    .replace(/^"`?|`?"$/g, '')
    .trim();
}

/**
 * A Mermaid `mindmap` block as an outline, or null for text that is not one.
 * Node shapes are let go — a topic has its own — and so are `::icon()` and
 * `:::class` lines, which carry nothing a topic can hold.
 */
export function parseMermaidMindmap(text: string): OutlineNode[] | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim() !== '');
  if (start === -1 || lines[start]!.trim() !== 'mindmap') return null;
  const nodes: Array<{ depth: number; text: string }> = [];
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('%%') || line.startsWith('::') || line.startsWith(':::')) {
      continue;
    }
    const words = mermaidWords(line.replace(/:::.*$/, '').trim());
    if (words !== '') nodes.push({ depth: indentOf(raw), text: words });
  }
  return nodes.length === 0 ? null : nest(nodes);
}

/**
 * New topics for an outline, hung under `parentId` in order, each taking the
 * colour, side and look a topic grown there by hand would.
 *
 * `board` is everything already there, the parent included. The topics come
 * back in the order to add them: every parent ahead of its children.
 */
export function topicsFromOutline(
  board: readonly Shape[],
  parentId: string,
  outline: readonly OutlineNode[],
  genId: () => string,
): TopicShape[] {
  const made: TopicShape[] = [];
  const shapes: Shape[] = [...board];
  const grow = (under: string, nodes: readonly OutlineNode[]) => {
    for (const node of nodes) {
      if (made.length >= MAX_OUTLINE_TOPICS) return;
      const topic = newChildTopic(shapes, under, genId());
      if (!topic) return;
      const named = { ...topic, text: node.text };
      made.push(named);
      shapes.push(named);
      grow(named.id, node.children);
    }
  };
  grow(parentId, outline);
  return made;
}

function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim();
}

/** Every topic of each map among `shapes`, centre first, depth first. */
function eachMap(
  shapes: readonly Shape[],
  visit: (forest: MindMapForest, root: TopicShape) => void,
): void {
  const forest = mindMapForest(shapes);
  const roots = [...forest.roots].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const root of roots) visit(forest, root);
}

/**
 * The maps among `shapes` as indented lists, two spaces a level, one blank
 * line between maps — what pastes straight into notes, a document or an
 * email, and back onto a board as the same map. Empty with no map among them.
 */
export function mindMapOutline(shapes: readonly Shape[]): string {
  const blocks: string[] = [];
  eachMap(shapes, (forest, root) => {
    const lines: string[] = [];
    const walk = (topic: TopicShape, depth: number) => {
      lines.push(`${'  '.repeat(depth)}${oneLine(topic.text)}`);
      for (const child of forest.children.get(topic.id) ?? []) walk(child, depth + 1);
    };
    walk(root, 0);
    blocks.push(lines.join('\n'));
  });
  return blocks.join('\n\n');
}

/** Words as they can stand inside a Mermaid node's brackets. */
function mermaidLabel(text: string): string {
  const words = oneLine(text).replace(/["`]/g, "'");
  return words === '' ? ' ' : words;
}

/**
 * The maps among `shapes` as Mermaid `mindmap` blocks, one per map — what
 * Copy as Mermaid gives for a map. Every label is a Markdown string, so
 * brackets and the like in a topic's words never read as Mermaid's own.
 */
export function mindMapMermaid(shapes: readonly Shape[]): string {
  const blocks: string[] = [];
  eachMap(shapes, (forest, root) => {
    const lines = ['mindmap'];
    let next = 0;
    const walk = (topic: TopicShape, depth: number) => {
      const id = depth === 0 ? 'root' : `t${(next += 1)}`;
      const label = `"\`${mermaidLabel(topic.text)}\`"`;
      lines.push(`${'  '.repeat(depth + 1)}${id}${depth === 0 ? `((${label}))` : `[${label}]`}`);
      for (const child of forest.children.get(topic.id) ?? []) walk(child, depth + 1);
    };
    walk(root, 0);
    blocks.push(lines.join('\n'));
  });
  return blocks.join('\n\n');
}

/** Whether there is a mind map among `shapes`. */
export function hasMindMap(shapes: readonly Shape[]): boolean {
  return shapes.some(isTopic);
}

/**
 * One topic of a mind map as the AI writes it: a line of JSON, how far below
 * the centre it sits and its words — `{"t":"topic","depth":1,"text":"Ads"}`.
 * The centre is depth 0. Lines in order make the map: each topic hangs under
 * the nearest line above it that sits one level higher.
 */
export interface MindMapLine {
  readonly depth: number;
  readonly text: string;
}

/** A topic line read and checked, or null for anything that is not one. */
export function parseMindMapLine(line: string): MindMapLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { t, depth, text } = value as Record<string, unknown>;
  if (t !== 'topic' || typeof text !== 'string') return null;
  if (typeof depth !== 'number' || !Number.isInteger(depth)) return null;
  if (depth < 0 || depth > MIND_MAP_MAX_DEPTH) return null;
  const words = oneLine(text).slice(0, MIND_MAP_TOPIC_MAX).trim();
  return words === '' ? null : { depth, text: words };
}

/** A topic as the line the AI writes for it. */
export function mindMapLineOf(depth: number, text: string): string {
  return JSON.stringify({ t: 'topic', depth, text });
}

/** Whether these lines are a mind map's rather than a diagram's. */
export function isMindMapLines(lines: readonly string[]): boolean {
  return lines.some((line) => parseMindMapLine(line) !== null);
}

/** The topic lines among `lines` as an outline, or null with none. */
export function outlineFromMindMapLines(lines: readonly string[]): OutlineNode[] | null {
  const topics = lines.flatMap((line) => {
    const topic = parseMindMapLine(line);
    return topic ? [topic] : [];
  });
  return topics.length === 0 ? null : nest(topics);
}
