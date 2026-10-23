import type { FlipAxis } from '../shapes/flip.js';
import type { MindMapLayout, Shape, TopicShape } from '../shapes/shape.js';
import { readMapLayout } from '../shapes/topic.js';
import { isMindMapRoot, mindMapForest, mindMapRootOf, withMindMapBranches } from './tree.js';

/**
 * What flipping does to a map, where the layout and not the topics'
 * positions says where everything goes.
 *
 * Turning a stack over — what was at the bottom at the top, at every depth
 * under the selected topics — is up and down for a map that grows sideways,
 * and across for one hung down. Across a map that grows sideways, its
 * branches change sides: one growing to one side grows to the other, and in
 * one growing both ways the whole map swaps for a centre, and for any other
 * topic the branch off the centre it is on, since a topic cannot sit on the
 * far side of its own parent. Up and down does nothing to a map hung down,
 * which has only the one way to hang.
 */
export function mindMapFlipPatches(
  shapes: readonly Shape[],
  ids: readonly string[],
  axis: FlipAxis,
): Array<{ id: string; patch: Partial<TopicShape> }> {
  const forest = mindMapForest(shapes);
  const selected = ids.map((id) => forest.topics.get(id)).filter((t) => t !== undefined);
  if (selected.length === 0) return [];

  const turned = new Set<string>();
  const branches = new Map<string, TopicShape>();
  const layouts = new Map<string, MindMapLayout>();
  for (const topic of selected) {
    const root = mindMapRootOf(topic, forest);
    const layout = readMapLayout(root.mapLayout);
    const turnsOver = axis === 'vertical' ? layout !== 'down' : layout === 'down';
    if (turnsOver) {
      for (const id of withMindMapBranches([topic.id], shapes)) {
        if (id !== topic.id) turned.add(id);
      }
      continue;
    }
    if (axis === 'vertical') continue;
    if (layout === 'left' || layout === 'right') {
      layouts.set(root.id, layout === 'left' ? 'right' : 'left');
      continue;
    }
    if (isMindMapRoot(topic, forest)) {
      for (const child of forest.children.get(topic.id) ?? []) branches.set(child.id, child);
      continue;
    }
    let branch: TopicShape = topic;
    for (;;) {
      const parent: TopicShape | undefined =
        branch.parentId === null ? undefined : forest.topics.get(branch.parentId);
      if (!parent || isMindMapRoot(parent, forest)) break;
      branch = parent;
    }
    branches.set(branch.id, branch);
  }

  const patches = new Map<string, Partial<TopicShape>>();
  const add = (id: string, patch: Partial<TopicShape>) =>
    patches.set(id, { ...patches.get(id), ...patch });
  // Negated rather than renumbered: the order among siblings reverses
  // whatever the numbers were, and no two of them can come out the same.
  for (const id of turned) {
    const topic = forest.topics.get(id);
    if (topic) add(id, { order: -topic.order || 0 });
  }
  for (const branch of branches.values()) {
    const side = branch.side === 'left' ? 'right' : 'left';
    for (const id of withMindMapBranches([branch.id], shapes)) add(id, { side });
  }
  for (const [id, mapLayout] of layouts) add(id, { mapLayout });
  return [...patches].map(([id, patch]) => ({ id, patch }));
}
