import type { Point } from '../math.js';
import { fontSizeOf, isTopic, type Shape, type TopicShape } from '../shapes/shape.js';
import { topicAnchor } from '../shapes/topic.js';
import { hiddenShapeIds } from '../shapes/visibility.js';
import { mindMapForest, topicGrowth, withMindMapBranches } from './tree.js';

/** The count drawn on a folded topic, where its branches would leave it. */
export interface FoldBadge {
  readonly topic: TopicShape;
  /** How many topics are folded away under it. */
  readonly count: number;
  /** Where the badge leaves the topic's edge, and its middle. */
  readonly from: Point;
  readonly centre: Point;
  readonly radius: number;
}

/**
 * A badge for every folded topic on show: a short stub off the side its
 * branches grow from, ending in a disc holding how many topics are folded
 * away — so a folded map never looks smaller than it is, and the disc is
 * there to be pressed to open it again.
 *
 * Handed the whole board, folded topics included, since those are what it
 * counts.
 */
export function mindMapFoldBadges(shapes: readonly Shape[]): FoldBadge[] {
  if (!shapes.some((shape) => isTopic(shape) && shape.collapsed === true)) return [];
  const hidden = hiddenShapeIds(shapes);
  const forest = mindMapForest(shapes);
  const badges: FoldBadge[] = [];
  for (const topic of forest.topics.values()) {
    if (topic.collapsed !== true || hidden.has(topic.id)) continue;
    const count = withMindMapBranches([topic.id], shapes).length - 1;
    if (count === 0) continue;
    const fontSize = fontSizeOf(topic);
    const radius = fontSize * 0.55;
    const gap = fontSize * 0.45;
    const growth = topicGrowth(topic, forest);
    const from = topicAnchor(topic, growth === 'down' ? 'bottom' : growth);
    const reach = gap + radius;
    badges.push({
      topic,
      count,
      from,
      centre:
        growth === 'down'
          ? { x: from.x, y: from.y + reach }
          : { x: from.x + (growth === 'left' ? -reach : reach), y: from.y },
      radius,
    });
  }
  return badges;
}

/** The folded topic whose badge is under the point, if any. */
export function mindMapFoldBadgeAt(shapes: readonly Shape[], point: Point): string | null {
  for (const badge of mindMapFoldBadges(shapes)) {
    const reach = badge.radius * 1.25;
    if (Math.hypot(point.x - badge.centre.x, point.y - badge.centre.y) <= reach) {
      return badge.topic.id;
    }
  }
  return null;
}
