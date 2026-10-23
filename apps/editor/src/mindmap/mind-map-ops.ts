import {
  createTopic,
  isTopic,
  layoutMindMaps,
  mindMapForest,
  mindMapRootOf,
  readMapLayout,
  readMapLines,
  newChildTopic,
  newSiblingTopic,
  topicsFromOutline,
  topicSize,
  type OutlineNode,
  type Shape,
  type TopicShape,
} from '@canvasflow/canvas-engine';
import type { ItemStyle, Point } from '../machine/tool-machine.types';

/** What Tab and Enter ask a selected topic for. */
export type TopicGrowth = 'child' | 'sibling';

/**
 * The centre of a new map, empty and centred on where it was asked for, in
 * the style the panel is showing.
 */
export function mindMapRootAt(point: Point, style: ItemStyle, scale: number, id: string) {
  const root = createTopic({
    id,
    x: point.x,
    y: point.y,
    text: '',
    parentId: null,
    strokeColor: style.strokeColor,
    fillColor: style.fillColor,
    opacity: style.opacity,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    mapLayout: style.mapLayout,
    mapLines: style.mapLines,
    topicShape: style.topicShape,
    scale,
  });
  const { width, height } = topicSize(root);
  return { ...root, x: point.x - width / 2, y: point.y - height / 2 };
}

/** A new topic grown from `topicId` — under it, or beside it — ready to add. */
export function grownTopic(
  shapes: readonly Shape[],
  topicId: string,
  growth: TopicGrowth,
  id: string,
): TopicShape | null {
  return growth === 'child'
    ? newChildTopic(shapes, topicId, id)
    : newSiblingTopic(shapes, topicId, id);
}

/**
 * The change that gives a topic new words.
 *
 * A centre keeps its middle where it was as its box grows or shrinks, the way
 * the words were typed into it. A branch needs nothing more: the layout puts
 * it against its parent whatever its size.
 */
export function topicTextPatch(
  shapes: readonly Shape[],
  topic: TopicShape,
  text: string,
): Partial<TopicShape> {
  const forest = mindMapForest(shapes);
  if (!forest.roots.some((root) => root.id === topic.id)) return { text };
  const before = topicSize(topic);
  const after = topicSize({ ...topic, text });
  return {
    text,
    x: topic.x + (before.width - after.width) / 2,
    y: topic.y + (before.height - after.height) / 2,
  };
}

/** Whether any topic branches from this one. */
export function hasBranches(shapes: readonly Shape[], topicId: string): boolean {
  return shapes.some((shape) => isTopic(shape) && shape.parentId === topicId);
}

/**
 * The board as it should be drawn while a topic's words are being typed: the
 * topic holding what is in the overlay, and its map laid out around that, so
 * the branches make room as the box grows.
 */
export function withTopicBeingTyped(
  shapes: readonly Shape[],
  topicId: string,
  text: string,
): Shape[] {
  const topic = shapes.find((shape): shape is TopicShape => shape.id === topicId && isTopic(shape));
  if (!topic || topic.text === text) return shapes as Shape[];
  const patch = topicTextPatch(shapes, topic, text);
  return layoutMindMaps(
    shapes.map((shape) => (shape.id === topicId ? ({ ...shape, ...patch } as Shape) : shape)),
  );
}

/**
 * The panel's reading of a shape, with a topic's layout and lines taken from
 * the centre of its map, which is the only topic that holds them.
 */
export function mapStyleFor(shape: Shape, shapes: readonly Shape[], style: ItemStyle): ItemStyle {
  if (!isTopic(shape)) return style;
  const root = mindMapRootOf(shape, mindMapForest(shapes));
  return {
    ...style,
    mapLayout: readMapLayout(root.mapLayout),
    mapLines: readMapLines(root.mapLines),
  };
}

/**
 * A new map from an outline, its centre on `point`: the outline's one top
 * line as the centre, or — when it has several — a centre called
 * `centreName` with each of them a branch off it.
 */
export function mindMapFromOutline(
  outline: readonly OutlineNode[],
  point: Point,
  style: ItemStyle,
  scale: number,
  centreName: string,
  genId: () => string,
): TopicShape[] {
  const [only] = outline;
  const single = outline.length === 1 && only !== undefined;
  const blank = mindMapRootAt(point, style, scale, genId());
  const named = { ...blank, text: single ? only.text : centreName };
  const { width, height } = topicSize(named);
  const root = { ...named, x: point.x - width / 2, y: point.y - height / 2 };
  const branches = single ? only.children : outline;
  return [root, ...topicsFromOutline([root], root.id, branches, genId)];
}
