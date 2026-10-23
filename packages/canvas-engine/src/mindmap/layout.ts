import { isTopic, type MindMapLines, type Shape, type TopicShape } from '../shapes/shape.js';
import { readMapLayout, readMapLines, topicAnchor, topicGaps, topicSize } from '../shapes/topic.js';
import { mindMapForest, mindMapRootOf, type MindMapForest } from './tree.js';

interface Placed {
  readonly x: number;
  readonly y: number;
}

/**
 * Every topic placed where its map puts it.
 *
 * A centre stays where it is stored. Its branches grow out from it to the
 * left and the right, each child a fixed gap beyond its parent, siblings
 * stacked top to bottom in order and the whole stack centred on the parent —
 * so a branch with more under it takes more room and pushes its neighbours
 * apart rather than running into them.
 *
 * Worked out on every read rather than stored, so it is the same tidy map for
 * everyone however many people are adding to it, and nothing has to be
 * written back when a branch grows. Shapes that are not topics, and topics
 * already where the layout puts them, come back as the same objects.
 */
export function layoutMindMaps(shapes: readonly Shape[]): Shape[] {
  let any = false;
  for (const shape of shapes) {
    if (isTopic(shape)) {
      any = true;
      break;
    }
  }
  if (!any) return shapes as Shape[];

  const forest = mindMapForest(shapes);
  const placed = new Map<string, Placed>();
  for (const root of forest.roots) layOutMap(root, forest, placed);

  return shapes.map((shape) => {
    if (!isTopic(shape)) return shape;
    const at = placed.get(shape.id);
    if (!at || (at.x === shape.x && at.y === shape.y)) return shape;
    return { ...shape, x: at.x, y: at.y };
  });
}

function layOutMap(root: TopicShape, forest: MindMapForest, placed: Map<string, Placed>): void {
  const layout = readMapLayout(root.mapLayout);
  const { across, between } = topicGaps(root);
  const sizes = new Map<string, { width: number; height: number }>();
  const sizeOf = (topic: TopicShape) => {
    let size = sizes.get(topic.id);
    if (!size) {
      size = topicSize(topic);
      sizes.set(topic.id, size);
    }
    return size;
  };
  const openChildren = (topic: TopicShape): readonly TopicShape[] =>
    topic.collapsed === true ? [] : (forest.children.get(topic.id) ?? []);

  // Folded topics are not drawn, but they are still shapes on the board. Put
  // where the topic that folds them is, so nothing that measures the board
  // finds them anywhere else.
  const foldUnder = (topic: TopicShape, at: Placed) => {
    const stack = [...(forest.children.get(topic.id) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (placed.has(next.id)) continue;
      placed.set(next.id, at);
      stack.push(...(forest.children.get(next.id) ?? []));
    }
  };

  placed.set(root.id, { x: root.x, y: root.y });
  if (root.collapsed === true) {
    foldUnder(root, root);
    return;
  }
  if (layout === 'down') {
    layOutDown(root, sizeOf, openChildren, foldUnder, placed, across * 0.75, between * 1.6);
    return;
  }

  // How tall a topic's branch is, everything further out included. Kept, as
  // every child is measured once for its parent's stack and again to place it.
  const spans = new Map<string, number>();
  const spanOf = (topic: TopicShape): number => {
    const known = spans.get(topic.id);
    if (known !== undefined) return known;
    const span = Math.max(sizeOf(topic).height, stackHeight(openChildren(topic)));
    spans.set(topic.id, span);
    return span;
  };
  const stackHeight = (stack: readonly TopicShape[]): number =>
    stack.length === 0
      ? 0
      : stack.reduce((sum, topic) => sum + spanOf(topic), 0) + between * (stack.length - 1);

  // Lays a stack of children out from `edge`, the side of their parent they
  // grow from, centred on `middle`.
  const placeStack = (
    stack: readonly TopicShape[],
    edge: number,
    middle: number,
    direction: 1 | -1,
  ) => {
    let top = middle - stackHeight(stack) / 2;
    for (const child of stack) {
      const span = spanOf(child);
      place(child, edge, top + span / 2, direction);
      top += span + between;
    }
  };

  const place = (topic: TopicShape, edge: number, middle: number, direction: 1 | -1) => {
    const { width, height } = sizeOf(topic);
    const x = direction === 1 ? edge : edge - width;
    const y = middle - height / 2;
    placed.set(topic.id, { x, y });
    if (topic.collapsed === true) {
      foldUnder(topic, { x, y });
      return;
    }
    const stack = forest.children.get(topic.id);
    if (stack) {
      placeStack(stack, direction === 1 ? x + width + across : x - across, middle, direction);
    }
  };

  const { width, height } = sizeOf(root);
  const middle = root.y + height / 2;
  const children = forest.children.get(root.id) ?? [];
  // Which side each branch off the centre grows on: its own in a map that
  // grows both ways, and the map's one side otherwise. The side each branch
  // keeps is left alone, so a map turned back to both ways is as it was.
  const onLeft = (child: TopicShape) =>
    layout === 'left' || (layout === 'both' && child.side === 'left');
  placeStack(
    children.filter((child) => !onLeft(child)),
    root.x + width + across,
    middle,
    1,
  );
  placeStack(children.filter(onLeft), root.x - across, middle, -1);
}

/**
 * A map hung down from its centre: each topic's children in a row under it,
 * a level's gap below, the row centred under the topic — so a topic with
 * more under it takes more of the row and pushes its neighbours apart.
 */
function layOutDown(
  root: TopicShape,
  sizeOf: (topic: TopicShape) => { width: number; height: number },
  openChildren: (topic: TopicShape) => readonly TopicShape[],
  foldUnder: (topic: TopicShape, at: Placed) => void,
  placed: Map<string, Placed>,
  level: number,
  between: number,
): void {
  const spans = new Map<string, number>();
  const spanOf = (topic: TopicShape): number => {
    const known = spans.get(topic.id);
    if (known !== undefined) return known;
    const span = Math.max(sizeOf(topic).width, rowWidth(openChildren(topic)));
    spans.set(topic.id, span);
    return span;
  };
  const rowWidth = (row: readonly TopicShape[]): number =>
    row.length === 0
      ? 0
      : row.reduce((sum, topic) => sum + spanOf(topic), 0) + between * (row.length - 1);

  const placeRow = (row: readonly TopicShape[], top: number, centre: number) => {
    let left = centre - rowWidth(row) / 2;
    for (const child of row) {
      const span = spanOf(child);
      place(child, top, left + span / 2);
      left += span + between;
    }
  };
  const place = (topic: TopicShape, top: number, centre: number) => {
    const { width, height } = sizeOf(topic);
    const at = { x: centre - width / 2, y: top };
    placed.set(topic.id, at);
    if (topic.collapsed === true) {
      foldUnder(topic, at);
      return;
    }
    placeRow(openChildren(topic), top + height + level, centre);
  };

  const { width, height } = sizeOf(root);
  placeRow(openChildren(root), root.y + height + level, root.x + width / 2);
}

/** One branch line: from the edge of a parent to the near edge of its child. */
export interface MindMapBranch {
  readonly parent: TopicShape;
  readonly child: TopicShape;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  /** Hanging down from the parent, rather than out from its side. */
  readonly vertical: boolean;
  /** How the map's lines are drawn, as its centre says. */
  readonly lines: MindMapLines;
}

/**
 * The lines joining laid-out topics, one per child whose parent is among the
 * shapes given.
 *
 * Each leaves the side of the parent facing the child and arrives at the
 * child's near side — or, in a map hung down, leaves the bottom of the
 * parent for the top of the child — so a branch reads as growing outward.
 */
export function mindMapBranches(shapes: readonly Shape[]): MindMapBranch[] {
  const forest = mindMapForest(shapes);
  const branches: MindMapBranch[] = [];
  for (const [parentId, children] of forest.children) {
    const parent = forest.topics.get(parentId)!;
    const root = mindMapRootOf(parent, forest);
    const lines = readMapLines(root.mapLines);
    const vertical = readMapLayout(root.mapLayout) === 'down';
    const p = topicSize(parent);
    for (const child of children) {
      if (vertical) {
        branches.push({
          parent,
          child,
          from: topicAnchor(parent, 'bottom'),
          to: topicAnchor(child, 'top'),
          vertical,
          lines,
        });
        continue;
      }
      const c = topicSize(child);
      const rightward = child.x + c.width / 2 >= parent.x + p.width / 2;
      branches.push({
        parent,
        child,
        from: topicAnchor(parent, rightward ? 'right' : 'left'),
        to: topicAnchor(child, rightward ? 'left' : 'right'),
        vertical,
        lines,
      });
    }
  }
  return branches;
}
