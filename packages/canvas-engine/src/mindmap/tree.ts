import { isTopic, type MindMapLayout, type Shape, type TopicShape } from '../shapes/shape.js';
import { BRANCH_COLORS, createTopic, nextBranchColor, readMapLayout } from '../shapes/topic.js';

/** The topics on a board, read as the maps they make up. */
export interface MindMapForest {
  readonly topics: ReadonlyMap<string, TopicShape>;
  /** Each topic's children, in order. A topic without any has no entry. */
  readonly children: ReadonlyMap<string, readonly TopicShape[]>;
  /** The centre of every map. */
  readonly roots: readonly TopicShape[];
}

function bySiblingOrder(a: TopicShape, b: TopicShape): number {
  // Two topics added at the same spot by two people at once share an order.
  // The id settles it, the same way on every client.
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Sort the board's topics into maps.
 *
 * A topic whose parent is missing, or is not a topic, is a centre. So is one
 * caught in a loop of parents, which no single client can write but two can
 * between them — one person hanging A under B while another hangs B under A.
 * The first of the loop in board order becomes its centre, and everything in
 * it stays on the board.
 */
export function mindMapForest(shapes: readonly Shape[]): MindMapForest {
  const topics = new Map<string, TopicShape>();
  for (const shape of shapes) if (isTopic(shape)) topics.set(shape.id, shape);

  const children = new Map<string, TopicShape[]>();
  const roots: TopicShape[] = [];
  for (const topic of topics.values()) {
    const parent = topic.parentId === null ? undefined : topics.get(topic.parentId);
    if (!parent || parent.id === topic.id) {
      roots.push(topic);
      continue;
    }
    const siblings = children.get(parent.id);
    if (siblings) siblings.push(topic);
    else children.set(parent.id, [topic]);
  }
  for (const siblings of children.values()) siblings.sort(bySiblingOrder);

  const reached = new Set<string>();
  const reach = (topic: TopicShape) => {
    const stack = [topic];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (reached.has(next.id)) continue;
      reached.add(next.id);
      for (const child of children.get(next.id) ?? []) stack.push(child);
    }
  };
  for (const root of roots) reach(root);
  if (reached.size < topics.size) {
    for (const topic of topics.values()) {
      if (reached.has(topic.id)) continue;
      // Cut from its parent's list so the loop is walked once, from here.
      const siblings = children.get(topic.parentId!);
      if (siblings) {
        const index = siblings.indexOf(topic);
        if (index !== -1) siblings.splice(index, 1);
      }
      roots.push(topic);
      reach(topic);
    }
  }

  return { topics, children, roots };
}

/** The ids given, with every topic further out along the branches of any of them. */
export function withMindMapBranches(ids: readonly string[], shapes: readonly Shape[]): string[] {
  const { children } = mindMapForest(shapes);
  const out = new Set<string>();
  const stack = [...ids];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of children.get(id) ?? []) stack.push(child.id);
  }
  return [...out];
}

/** The centre of the map a topic is in; any other shape answers for itself. */
export function mindMapRootId(id: string, forest: MindMapForest): string {
  const seen = new Set<string>();
  let current = forest.topics.get(id);
  if (!current) return id;
  const roots = new Set(forest.roots.map((root) => root.id));
  while (!roots.has(current.id) && !seen.has(current.id)) {
    seen.add(current.id);
    const parent: TopicShape | undefined =
      current.parentId === null ? undefined : forest.topics.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

/** The ids given, each topic among them swapped for the centre of its map. */
export function withMindMapRoots(ids: readonly string[], shapes: readonly Shape[]): string[] {
  const forest = mindMapForest(shapes);
  return [...new Set(ids.map((id) => mindMapRootId(id, forest)))];
}

/** Whether the topic is the centre of its map. */
export function isMindMapRoot(topic: TopicShape, forest: MindMapForest): boolean {
  return forest.roots.some((root) => root.id === topic.id);
}

/**
 * The side a new child of the centre goes on: whichever has fewer branches,
 * the right when they are even — so a map fills out both ways in turn.
 */
function sideForNewBranch(siblings: readonly TopicShape[]): 'left' | 'right' {
  let right = 0;
  let left = 0;
  for (const sibling of siblings) {
    if (sibling.side === 'left') left++;
    else right++;
  }
  return left < right ? 'left' : 'right';
}

/** The branch colour used least among the centre's children, first in the list on a tie. */
function colourForNewBranch(siblings: readonly TopicShape[]): string {
  const uses = new Map<string, number>(BRANCH_COLORS.map((colour) => [colour, 0]));
  for (const sibling of siblings) {
    const key = sibling.strokeColor.toLowerCase();
    if (uses.has(key)) uses.set(key, uses.get(key)! + 1);
  }
  let best: string = BRANCH_COLORS[0];
  for (const colour of BRANCH_COLORS) if (uses.get(colour)! < uses.get(best)!) best = colour;
  return best;
}

/**
 * A new last child for `parentId`, ready to be added.
 *
 * It takes its parent's type and scale, and a colour of its own. Off the
 * centre it opens a branch, so it takes the colour its siblings use least and
 * the emptier side; further out it takes the colour after its parent's, so
 * it never comes out the same as the topic it grew from.
 */
export function newChildTopic(
  shapes: readonly Shape[],
  parentId: string,
  id: string,
): TopicShape | null {
  const forest = mindMapForest(shapes);
  const parent = forest.topics.get(parentId);
  if (!parent) return null;
  const siblings = forest.children.get(parentId) ?? [];
  const fromCentre = isMindMapRoot(parent, forest);
  const last = siblings[siblings.length - 1];
  return createTopic({
    id,
    x: parent.x,
    y: parent.y,
    text: '',
    parentId,
    side: fromCentre ? sideForNewBranch(siblings) : parent.side,
    order: last ? last.order + 1 : 0,
    strokeColor: fromCentre ? colourForNewBranch(siblings) : nextBranchColor(parent.strokeColor),
    fontSize: parent.fontSize,
    fontFamily: parent.fontFamily,
    opacity: parent.opacity,
    // The outline carries on from the topic it grew from, so a map drawn in
    // one look stays in it however it grows.
    ...(parent.topicShape && { topicShape: parent.topicShape }),
    ...(parent.scale !== undefined && { scale: parent.scale }),
  });
}

/**
 * A new topic just below `topicId`, beside it on the same branch, in the
 * colour after its own — or, off the centre, the one its siblings use least.
 *
 * The centre has no siblings, so asking for one there gives it a child.
 */
export function newSiblingTopic(
  shapes: readonly Shape[],
  topicId: string,
  id: string,
): TopicShape | null {
  const forest = mindMapForest(shapes);
  const topic = forest.topics.get(topicId);
  if (!topic) return null;
  if (isMindMapRoot(topic, forest) || topic.parentId === null) {
    return newChildTopic(shapes, topicId, id);
  }
  const siblings = forest.children.get(topic.parentId) ?? [];
  const index = siblings.findIndex((sibling) => sibling.id === topic.id);
  // Among the topics on the same side only: on the centre, the next child in
  // order may be across the map, and the new one is meant to land under this.
  const next = siblings.slice(index + 1).find((sibling) => sibling.side === topic.side);
  const order = next ? (topic.order + next.order) / 2 : topic.order + 1;
  const parent = forest.topics.get(topic.parentId);
  const offCentre = parent !== undefined && isMindMapRoot(parent, forest);
  return createTopic({
    id,
    x: topic.x,
    y: topic.y,
    text: '',
    parentId: topic.parentId,
    side: topic.side,
    order,
    strokeColor: offCentre ? colourForNewBranch(siblings) : nextBranchColor(topic.strokeColor),
    fontSize: topic.fontSize,
    fontFamily: topic.fontFamily,
    opacity: topic.opacity,
    ...(topic.topicShape && { topicShape: topic.topicShape }),
    ...(topic.scale !== undefined && { scale: topic.scale }),
  });
}

/**
 * Topics pointed at their parents' new ids, after a set of shapes has been
 * given fresh ones on its way onto a board.
 *
 * `renamed` maps each old id to its new one. A topic whose parent did not
 * come along becomes the centre of a map of its own, where it lands, rather
 * than reaching back to a map on whatever board it was taken from.
 */
export function relinkTopicParents(
  shapes: readonly Shape[],
  renamed: ReadonlyMap<string, string>,
): Shape[] {
  return shapes.map((shape) => {
    if (!isTopic(shape) || shape.parentId === null) return shape;
    return { ...shape, parentId: renamed.get(shape.parentId) ?? null };
  });
}

/** The centre of the map a topic is in, as a topic. */
export function mindMapRootOf(topic: TopicShape, forest: MindMapForest): TopicShape {
  return forest.topics.get(mindMapRootId(topic.id, forest)) ?? topic;
}

/** How the map a topic is in is laid out, as its centre says. */
export function mindMapLayoutOf(topic: TopicShape, forest: MindMapForest): MindMapLayout {
  return readMapLayout(mindMapRootOf(topic, forest).mapLayout);
}

/**
 * Which way a topic's own branches grow from it: off its right or left side,
 * or down from its bottom. A centre with branches both ways answers right,
 * for whatever is placed on one side of it.
 */
export function topicGrowth(topic: TopicShape, forest: MindMapForest): 'right' | 'left' | 'down' {
  switch (mindMapLayoutOf(topic, forest)) {
    case 'down':
      return 'down';
    case 'right':
      return 'right';
    case 'left':
      return 'left';
    default:
      return isMindMapRoot(topic, forest) || topic.side !== 'left' ? 'right' : 'left';
  }
}
