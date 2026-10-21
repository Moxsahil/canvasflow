import { collectDiagram } from './ir.js';
import { layoutDiagram } from './layout.js';
import { layoutDiagramWithElk, type ElkLike } from './layout-elk.js';
import { diagramToShapes, type DiagramShapeOptions } from './to-shapes.js';
import type { DiagramLineError } from './ir.js';
import type { Shape } from '../shapes/shape.js';

export {
  collectDiagram,
  completeLines,
  parseDiagramLine,
  DEFAULT_DIRECTION,
  DIRECTIONS,
  EDGE_DIRS,
  EDGE_STYLES,
  NODE_KINDS,
  TEXT_SIZES,
} from './ir.js';
export type {
  CollectedDiagram,
  DiagramEdge,
  DiagramElement,
  DiagramGroup,
  DiagramIR,
  DiagramLineError,
  DiagramNode,
  DiagramText,
  Direction,
  EdgeDir,
  EdgeStyle,
  NodeKind,
  ParsedLine,
  TextSize,
} from './ir.js';

export { layoutDiagram } from './layout.js';
export type {
  LaidOutGroup,
  LaidOutNode,
  LaidOutText,
  PositionedDiagram,
  RoutedEdge,
} from './layout.js';

export { layoutDiagramWithElk } from './layout-elk.js';
export type { ElkGraphEdge, ElkGraphNode, ElkLike } from './layout-elk.js';

export { diagramToShapes } from './to-shapes.js';
export type { DiagramIconImage, DiagramShapeOptions } from './to-shapes.js';

export { DIAGRAM_PAINT } from './palette.js';
export { DEFAULT_DIAGRAM_STYLE } from './measure.js';
export type { DiagramStyle } from './measure.js';

export interface BuiltDiagram {
  readonly shapes: Shape[];
  readonly errors: readonly DiagramLineError[];
}

/**
 * The whole path from streamed lines to shapes.
 *
 * The one entry point a caller needs: complete lines in, shapes and whatever
 * could not be used out. Total by design — a diagram with a bad line still
 * draws the rest, which is what lets the preview keep up with a stream that is
 * still arriving.
 */
export function buildDiagram(
  lines: readonly string[],
  genId: () => string,
  options: DiagramShapeOptions = {},
): BuiltDiagram {
  const { diagram, errors } = collectDiagram(lines);
  const positioned = layoutDiagram(diagram, options.style);
  return { shapes: diagramToShapes(positioned, genId, options), errors };
}

/**
 * The same, laid out in full: groups arranged as regions and arrows routed
 * round the boxes. Falls back to the quick layout if ELK fails, so a diagram
 * always draws.
 */
export async function buildDiagramWithElk(
  lines: readonly string[],
  genId: () => string,
  options: DiagramShapeOptions & { readonly elk: ElkLike },
): Promise<BuiltDiagram> {
  const { diagram, errors } = collectDiagram(lines);
  let positioned;
  try {
    positioned = await layoutDiagramWithElk(diagram, options.elk, options.style);
  } catch {
    positioned = layoutDiagram(diagram, options.style);
  }
  return { shapes: diagramToShapes(positioned, genId, options), errors };
}
