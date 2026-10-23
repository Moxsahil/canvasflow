import type { Point } from '../math.js';
import { isTopic, type Shape, type TopicShape } from '../shapes/shape.js';
import { readMapLayout, topicGaps, topicSize } from '../shapes/topic.js';
import {
  isMindMapRoot,
  mindMapForest,
  mindMapLayoutOf,
  mindMapRootId,
  withMindMapBranches,
} from './tree.js';

/** Where a dragged topic lands: under which topic, on which side, at what place. */
export interface TopicDrop {
  readonly parentId: string;
  readonly side: 'left' | 'right';
  readonly order: number;
}

function inside(topic: TopicShape, point: Point): boolean {
  const { width, height } = topicSize(topic);
  return (
    point.x >= topic.x &&
    point.x <= topic.x + width &&
    point.y >= topic.y &&
    point.y <= topic.y + height
  );
}

/**
 * Where a topic dragged to `point` would land, or null when it is not over
 * anywhere it could go — dropped there, it goes back where it was.
 *
 * Three readings, in order:
 *
 * - Over a topic: it becomes that topic's last child. Over a centre, on the
 *   side of it the pointer is on.
 * - Level with a topic and over its column: it goes in beside that topic,
 *   above or below it by which half the pointer is in — which is how a topic
 *   is put in a new place among its siblings, or moved to another branch.
 * - Beside a centre, on a side with nothing on it yet: it starts that side.
 *
 * Never into its own branch, which would cut it off from its map. `shapes`
 * are the laid-out shapes on show, so the answer is about what is on screen.
 */
export function mindMapDropAt(
  shapes: readonly Shape[],
  draggedId: string,
  point: Point,
): TopicDrop | null {
  const forest = mindMapForest(shapes);
  const dragged = forest.topics.get(draggedId);
  if (!dragged || isMindMapRoot(dragged, forest)) return null;
  const branch = new Set(withMindMapBranches([draggedId], shapes));
  const targets = [...forest.topics.values()].filter((topic) => !branch.has(topic.id));
  const childrenOf = (id: string) =>
    (forest.children.get(id) ?? []).filter((child) => !branch.has(child.id));

  const asLastChild = (parent: TopicShape, side: 'left' | 'right'): TopicDrop => {
    const children = childrenOf(parent.id);
    const last = children[children.length - 1];
    return { parentId: parent.id, side, order: last ? last.order + 1 : 0 };
  };

  // Over a topic.
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i]!;
    if (!inside(target, point)) continue;
    if (isMindMapRoot(target, forest)) {
      // Onto the side of a centre the pointer is on, in a map that grows both
      // ways; a map that grows one way has only the one.
      const layout = mindMapLayoutOf(target, forest);
      const { width } = topicSize(target);
      const side =
        layout === 'left' || layout === 'right'
          ? layout
          : layout === 'down'
            ? dragged.side
            : point.x < target.x + width / 2
              ? 'left'
              : 'right';
      return asLastChild(target, side);
    }
    return asLastChild(target, target.side);
  }

  // Level with a topic, over its column — or, in a map hung down, beside it
  // in its row.
  let beside: { topic: TopicShape; distance: number; down: boolean } | null = null;
  for (const target of targets) {
    if (isMindMapRoot(target, forest) || target.parentId === null) continue;
    const { width, height } = topicSize(target);
    const down = mindMapLayoutOf(target, forest) === 'down';
    let distance: number;
    if (down) {
      const reach = topicGaps(target).between * 1.6 + width / 2;
      if (point.y < target.y - height || point.y > target.y + height * 2) continue;
      distance = Math.abs(point.x - (target.x + width / 2));
      if (distance > reach) continue;
    } else {
      const reach = topicGaps(target).between + height;
      if (point.x < target.x - reach || point.x > target.x + width + reach) continue;
      distance = Math.abs(point.y - (target.y + height / 2));
      if (distance > reach) continue;
    }
    if (!beside || distance < beside.distance) beside = { topic: target, distance, down };
  }
  if (beside) {
    const target = beside.topic;
    const parent = forest.topics.get(target.parentId!)!;
    // Only a map growing both ways keeps its centre's branches apart by side.
    const bySide = isMindMapRoot(parent, forest) && mindMapLayoutOf(parent, forest) === 'both';
    const siblings = childrenOf(parent.id).filter(
      (sibling) => !bySide || sibling.side === target.side,
    );
    const index = siblings.indexOf(target);
    const { width, height } = topicSize(target);
    const below = beside.down ? point.x > target.x + width / 2 : point.y > target.y + height / 2;
    const neighbour = below ? siblings[index + 1] : siblings[index - 1];
    const order = neighbour
      ? (target.order + neighbour.order) / 2
      : target.order + (below ? 1 : -1);
    return { parentId: parent.id, side: target.side, order };
  }

  // Beside a centre, on a side nothing is on yet.
  const root = forest.topics.get(mindMapRootId(draggedId, forest));
  if (root && readMapLayout(root.mapLayout) === 'both') {
    const { width, height } = topicSize(root);
    const { across } = topicGaps(root);
    const level = Math.abs(point.y - (root.y + height / 2)) <= height * 2;
    const side = point.x < root.x ? 'left' : point.x > root.x + width ? 'right' : null;
    const gap = side === 'left' ? root.x - point.x : point.x - (root.x + width);
    const empty = side !== null && !childrenOf(root.id).some((child) => child.side === side);
    if (level && side && empty && gap <= across * 4) return asLastChild(root, side);
  }

  return null;
}

/**
 * The writes that land a dragged topic: its new parent and place, and the
 * side for it and everything further out along its branch, which follows it
 * across the map.
 */
export function topicDropPatches(
  shapes: readonly Shape[],
  draggedId: string,
  drop: TopicDrop,
): Array<{ id: string; patch: Partial<TopicShape> }> {
  const patches: Array<{ id: string; patch: Partial<TopicShape> }> = [];
  for (const id of withMindMapBranches([draggedId], shapes)) {
    const topic = shapes.find((shape): shape is TopicShape => shape.id === id && isTopic(shape));
    if (!topic) continue;
    if (id === draggedId) {
      patches.push({ id, patch: { parentId: drop.parentId, side: drop.side, order: drop.order } });
    } else if (topic.side !== drop.side) {
      patches.push({ id, patch: { side: drop.side } });
    }
  }
  return patches;
}

/** The shapes as they would be with the topic dropped there, before anything is written. */
export function withTopicDropped(
  shapes: readonly Shape[],
  draggedId: string,
  drop: TopicDrop,
): Shape[] {
  const patches = new Map(
    topicDropPatches(shapes, draggedId, drop).map(({ id, patch }) => [id, patch]),
  );
  return shapes.map((shape) => {
    const patch = patches.get(shape.id);
    return patch ? ({ ...shape, ...patch } as Shape) : shape;
  });
}
