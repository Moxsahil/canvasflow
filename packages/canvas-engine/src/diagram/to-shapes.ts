/**
 * From a laid-out diagram to shapes on a board.
 *
 * What comes out is ordinary shapes — the same ones the tools make — so a
 * generated diagram can be dragged, restyled, erased and undone exactly like a
 * drawn one, and nothing downstream needs to know where it came from.
 */

import { createArrow } from '../shapes/arrow.js';
import { bindingFor, resolveArrowTerminals } from '../shapes/arrow-binding.js';
import { createDiamond } from '../shapes/diamond.js';
import { createEllipse } from '../shapes/ellipse.js';
import { createRectangle } from '../shapes/rectangle.js';
import { DEFAULT_FONT_SIZE } from '../shapes/text.js';
import { createText } from '../shapes/text.js';
import type { Shape } from '../shapes/shape.js';
import type { LaidOutNode, PositionedDiagram } from './layout.js';

const LINE_HEIGHT = 1.2;

/**
 * A seed that depends only on the node it belongs to.
 *
 * The shape factories reach for a random seed when none is given, and a random
 * seed would mean two people generating the same diagram get two differently
 * wobbled boards — and a test that passes only sometimes. Deriving it from the
 * id keeps the sketchiness varied between shapes and identical between runs.
 */
function seedFrom(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % 2 ** 31;
}

function boxFor(node: LaidOutNode, id: string): Shape {
  const common = {
    id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    seed: seedFrom(node.id),
  };

  switch (node.kind) {
    case 'rectangle':
      return createRectangle({ ...common, edges: 'round' });
    case 'ellipse':
      return createEllipse(common);
    case 'diamond':
      return createDiamond(common);
  }
}

/**
 * The label for a node, as its own shape.
 *
 * The engine has no text bound to a shape, so a node is a box and a caption
 * that happen to sit together — which is exactly what a person gets when they
 * draw a box and type next to it. They can be pulled apart, and that is
 * consistent rather than surprising.
 */
function labelFor(node: LaidOutNode, id: string): Shape {
  const lines = node.label.split('\n').length;
  const textHeight = lines * DEFAULT_FONT_SIZE * LINE_HEIGHT;

  return createText({
    id,
    // Centred text anchors on x, so this is the middle of the box, not its edge.
    x: node.x + node.width / 2,
    y: node.y + (node.height - textHeight) / 2,
    text: node.label,
    textAlign: 'center',
    seed: seedFrom(`${node.id}:label`),
  });
}

/**
 * Convert a laid-out diagram into shapes.
 *
 * Order is z-order: boxes, then the arrows between them, then labels on top.
 * `genId` supplies the ids so the caller keeps whatever guarantees it needs
 * about uniqueness across a board.
 */
export function diagramToShapes(positioned: PositionedDiagram, genId: () => string): Shape[] {
  const boxes: Shape[] = [];
  const labels: Shape[] = [];
  const shapeByNodeId = new Map<string, Shape>();

  for (const node of positioned.nodes) {
    const box = boxFor(node, genId());
    boxes.push(box);
    shapeByNodeId.set(node.id, box);
    labels.push(labelFor(node, genId()));
  }

  const arrows: Shape[] = [];
  const shapesById = new Map(boxes.map((s) => [s.id, s]));

  for (const edge of positioned.edges) {
    const from = shapeByNodeId.get(edge.from);
    const to = shapeByNodeId.get(edge.to);
    // collectDiagram drops edges that name a missing node, so this is a guard
    // for callers building a diagram by hand rather than an expected branch.
    if (!from || !to) continue;

    const fromCentre = { x: from.x + widthOf(from) / 2, y: from.y + heightOf(from) / 2 };
    const toCentre = { x: to.x + widthOf(to) / 2, y: to.y + heightOf(to) / 2 };

    // Bound imprecisely on purpose: the arrow then aims at the middle of each
    // box and stops at whichever edge faces the other one, so it re-aims itself
    // when either box is dragged.
    const startBinding = bindingFor(from, fromCentre, false);
    const endBinding = bindingFor(to, toCentre, false);

    const provisional = createArrow({
      id: genId(),
      x: fromCentre.x,
      y: fromCentre.y,
      points: [
        [0, 0],
        [toCentre.x - fromCentre.x, toCentre.y - fromCentre.y],
      ],
      startBinding,
      endBinding,
      label: edge.label,
      seed: seedFrom(`${edge.from}->${edge.to}`),
    });

    // Ask the binding rules where the ends actually land, then store that, so
    // the arrow's own points are already right the first time it is drawn —
    // a preview never goes through the editor's binding pass.
    const { start, end } = resolveArrowTerminals(provisional, shapesById);

    arrows.push(
      createArrow({
        id: provisional.id,
        x: start.x,
        y: start.y,
        points: [
          [0, 0],
          [end.x - start.x, end.y - start.y],
        ],
        startBinding,
        endBinding,
        label: edge.label,
        seed: provisional.seed,
      }),
    );
  }

  return [...boxes, ...arrows, ...labels];
}

function widthOf(shape: Shape): number {
  return 'width' in shape ? shape.width : 0;
}

function heightOf(shape: Shape): number {
  return 'height' in shape ? shape.height : 0;
}
