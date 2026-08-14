import type { Tool } from '@/tools/tool';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE_COLOR,
  type Arrowhead,
  type ArrowType,
  type Edges,
  type FillStyle,
  type Roughness,
  type Shape,
  type StrokeStyle,
} from '@canvasflow/canvas-engine';

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

/**
 * Style applied to the next shape drawn. The properties panel edits this when
 * nothing is selected, so a tool "remembers" the look you last chose.
 *
 * It carries the union of every kind's styleable fields; the panel shows only
 * the ones that apply to what's being edited, and the shape factories ignore
 * whatever doesn't belong to them.
 */
export interface ItemStyle {
  readonly strokeColor: string;
  readonly fillColor: string | null;
  readonly fillStyle: FillStyle;
  readonly strokeWidth: number;
  readonly strokeStyle: StrokeStyle;
  readonly roughness: Roughness;
  readonly edges: Edges;
  /** 0–100. */
  readonly opacity: number;
  // text
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly textAlign: 'left' | 'center' | 'right';
  // arrow
  readonly arrowType: ArrowType;
  readonly startArrowhead: Arrowhead;
  readonly endArrowhead: Arrowhead;
  // freehand
  readonly simulatePressure: boolean;
}

/** strokeColor matches the first swatch in the panel, so it opens with a selection. */
export const DEFAULT_ITEM_STYLE: ItemStyle = {
  strokeColor: DEFAULT_STROKE_COLOR,
  fillColor: null,
  fillStyle: 'hachure',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  edges: 'sharp',
  opacity: 100,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  textAlign: 'left',
  arrowType: 'straight',
  startArrowhead: 'none',
  endArrowhead: 'arrow',
  simulatePressure: true,
};

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
  /** Id of the existing text shape being edited, or null when creating new text. */
  editingTextShapeId: string | null;
  /** The camera transform for the viewport. */
  camera: Camera;
  /** True while user is holding Space to pan. */
  isSpacePressed: boolean;

  selectedIds: string[];

  marquee: { x: number; y: number; width: number; height: number } | null;

  dragOriginShapes: Record<string, Shape>;

  resizeHandle: HandleIndex | null;
  resizeOriginShape: Shape | null;

  /** Style used for shapes drawn from here on. */
  itemStyle: ItemStyle;

  /**
   * Shapes the eraser has swept over but not yet deleted. They render faded
   * until the stroke ends, so the gesture stays reversible while in progress.
   */
  erasePending: string[];
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
  | { type: 'EDIT_TEXT_SHAPE'; shapeId: string; position: Point; existingText: string }
  | { type: 'SPACE_DOWN' }
  | { type: 'SPACE_UP' }
  | { type: 'PAN_BY'; dx: number; dy: number }
  | { type: 'ZOOM_BY'; delta: number; anchor: Point }
  | { type: 'RESET_VIEW' }
  | { type: 'SET_CAMERA'; camera: Camera }
  | { type: 'DELETE_SELECTED' }
  | { type: 'SELECT_ALL'; shapeIds: string[] }
  | { type: 'DESELECT' }
  | { type: 'SET_ITEM_STYLE'; style: Partial<ItemStyle> }
  | { type: 'ERASE_MARK'; ids: readonly string[]; restore: boolean }
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
