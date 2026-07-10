import type { Tool } from '@/tools/tool';
import type { Shape } from '@canvasflow/canvas-engine';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Camera {
  /** World - space translation (in canvas coordinates)*/
  readonly x: number;
  readonly y: number;
  /** 1.0 = 100%, 0.1% = 10% (max out), 5.0 = 500% (max in). */
  readonly zoom: number;
}

export const IDENTITY_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

export type HandleIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

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
  /** The camera transform for the viewport. */
  camera: Camera;
  /** True while user is holding Space to pan. */
  isSpacePressed: boolean;

  selectedIds: string[];

  marquee: { x: number; y: number; width: number; height: number } | null;

  dragOriginShapes: Record<string, Shape>;

  resizeHandle: HandleIndex | null;
  resizeOriginShape: Shape | null;
}

export type ToolMachineEvent =
  | { type: 'SELECT_TOOL'; tool: Tool }
  | {
      type: 'POINTER_DOWN';
      point: Point;
      button: number;
      shiftKey: boolean;
      hitShapeId: string | null;
      hitHandle: HandleIndex | null;
    }
  | { type: 'POINTER_MOVE'; point: Point; screenDelta: Point }
  | { type: 'POINTER_UP'; point: Point }
  | { type: 'ESCAPE' }
  | { type: 'COMMIT_TEXT'; text: string }
  | { type: 'CANCEL_TEXT' }
  | { type: 'SPACE_DOWN' }
  | { type: 'SPACE_UP' }
  | { type: 'PAN_BY'; dx: number; dy: number }
  | { type: 'ZOOM_BY'; delta: number; anchor: Point }
  | { type: 'RESET_VIEW' }
  | { type: 'DELETE_SELECTED' }
  | { type: 'SELECT_ALL'; shapeIds: string[] }
  | { type: 'DESELECT' }
  | { type: 'INTERNAL_UPDATE_SHAPES'; shapes: Shape[] };

export interface ShapeCommitted {
  shape: Shape;
}

export interface ShapesUpdated {
  shapes: Shape[];
}

export interface ShapesDeleted {
  ids: string[];
}
