import type { Tool } from '@/tools/tool';
import type { Shape } from '@canvasflow/canvas-engine';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ToolMachineContext {
  /** Currently active tool. */
  activeTool: Tool;
  /** Where the current pointer-down started (canvas coords). */
  pointerDownAt: Point | null;
  /** The shape being drawn right now (null when not drawing). */
  newElement: Shape | null;
  /** Freehand accumulates points as the pointer moves. */
  freehandPoints: Array<readonly [number, number]>;
  /** Position where text tool was clicked (null when not editing text). */
  textEditingAt: Point | null;
}

export type ToolMachineEvent =
  | { type: 'SELECT_TOOL'; tool: Tool }
  | { type: 'POINTER_DOWN'; point: Point }
  | { type: 'POINTER_MOVE'; point: Point }
  | { type: 'POINTER_UP'; point: Point }
  | { type: 'ESCAPE' }
  | { type: 'COMMIT_TEXT'; text: string }
  | { type: 'CANCEL_TEXT' };

export interface ShapeCommitted {
  shape: Shape;
}
