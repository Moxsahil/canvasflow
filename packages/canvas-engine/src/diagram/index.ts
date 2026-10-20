import { collectDiagram } from './ir.js';
import { layoutDiagram } from './layout.js';
import { diagramToShapes } from './to-shapes.js';
import type { DiagramLineError } from './ir.js';
import type { Shape } from '../shapes/shape.js';

export {
  collectDiagram,
  completeLines,
  parseDiagramLine,
  DEFAULT_DIRECTION,
  DIRECTIONS,
  NODE_KINDS,
} from './ir.js';
export type {
  CollectedDiagram,
  DiagramEdge,
  DiagramElement,
  DiagramIR,
  DiagramLineError,
  DiagramNode,
  Direction,
  NodeKind,
  ParsedLine,
} from './ir.js';

export { layoutDiagram } from './layout.js';
export type { LaidOutNode, PositionedDiagram } from './layout.js';

export { diagramToShapes } from './to-shapes.js';

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
export function buildDiagram(lines: readonly string[], genId: () => string): BuiltDiagram {
  const { diagram, errors } = collectDiagram(lines);
  const positioned = layoutDiagram(diagram);
  return { shapes: diagramToShapes(positioned, genId), errors };
}
