import { assign, emit, setup } from 'xstate';
import {
  createArrow,
  createDiamond,
  createEllipse,
  createFreehand,
  createLine,
  createRectangle,
  shapeBounds,
  type Shape,
} from '@canvasflow/canvas-engine';
import {
  IDENTITY_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
  type HandleIndex,
  type ToolMachineContext,
  type ToolMachineEvent,
} from './tool-machine.types';

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const MIN_TEXT_FONT_SIZE = 8;
const MAX_TEXT_FONT_SIZE = 200;

// Each handle's position as a fraction of the bounding box (0=left/top,
// 1=right/bottom, 0.5=center). Used to resize text: the ANCHOR for a given
// handle is the point at the opposite fraction (1 - fx, 1 - fy), so e.g. the
// top-left corner (0,0) anchors at the bottom-right (1,1), and top-center
// (0.5,0) anchors at bottom-center (0.5,1) — keeping the horizontal center
// fixed and only the dragged edge moving.
const TEXT_HANDLE_FRACTIONS: Record<HandleIndex, readonly [number, number]> = {
  0: [0, 0], // TL
  1: [0.5, 0], // TC
  2: [1, 0], // TR
  3: [1, 0.5], // MR
  4: [1, 1], // BR
  5: [0.5, 1], // BC
  6: [0, 1], // BL
  7: [0, 0.5], // ML
};

/**
 * Resize a shape based on which handle is being dragged and the pointer position.
 * Handle indices: 0=TL 1=TC 2=TR 3=MR 4=BR 5=BC 6=BL 7=ML
 */
function resizeShape(original: Shape, handle: HandleIndex, dx: number, dy: number): Shape {
  if (original.kind === 'line' || original.kind === 'arrow' || original.kind === 'freehand') {
    // Linear shapes don't resize via handles in this PR
    return original;
  }
  if (original.kind === 'text') {
    // Text has no independent width/height — its rendered size is driven
    // entirely by fontSize, so every handle (corner or edge) scales fontSize
    // uniformly. The point opposite the dragged handle stays anchored in
    // place; see TEXT_HANDLE_FRACTIONS for how that opposite point is derived.
    const bounds = shapeBounds(original);
    if (bounds.width <= 0 || bounds.height <= 0) {
      return original;
    }

    const [fx, fy] = TEXT_HANDLE_FRACTIONS[handle];
    const anchorX = bounds.x + (1 - fx) * bounds.width;
    const anchorY = bounds.y + (1 - fy) * bounds.height;
    const draggedX = bounds.x + fx * bounds.width + dx;
    const draggedY = bounds.y + fy * bounds.height + dy;

    const scale = Math.max(
      Math.abs(draggedX - anchorX) / bounds.width,
      Math.abs(draggedY - anchorY) / bounds.height,
    );
    const newFontSize = clamp(original.fontSize * scale, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE);
    const actualScale = newFontSize / original.fontSize;
    const scaledWidth = bounds.width * actualScale;
    const scaledHeight = bounds.height * actualScale;

    return {
      ...original,
      fontSize: newFontSize,
      x: anchorX - (1 - fx) * scaledWidth,
      y: anchorY - (1 - fy) * scaledHeight,
    };
  }

  // For rect/ellipse/diamond
  const shape = original as typeof original & { width: number; height: number };
  let x = shape.x;
  let y = shape.y;
  let width = shape.width;
  let height = shape.height;

  // Horizontal axis
  if (handle === 0 || handle === 6 || handle === 7) {
    // left side handles
    x = shape.x + dx;
    width = shape.width - dx;
  } else if (handle === 2 || handle === 3 || handle === 4) {
    // right side handles
    width = shape.width + dx;
  }

  // Vertical axis
  if (handle === 0 || handle === 1 || handle === 2) {
    // top side handles
    y = shape.y + dy;
    height = shape.height - dy;
  } else if (handle === 4 || handle === 5 || handle === 6) {
    // bottom side handles
    height = shape.height + dy;
  }

  // Prevent inversion
  if (width < 1) {
    x = x + width - 1;
    width = 1;
  }
  if (height < 1) {
    y = y + height - 1;
    height = 1;
  }

  return { ...shape, x, y, width, height } as Shape;
}

export const toolMachine = setup({
  types: {
    context: {} as ToolMachineContext,
    events: {} as ToolMachineEvent,
    emitted: {} as
      | { type: 'shape.committed'; shape: Shape }
      | { type: 'shapes.updated'; shapes: Shape[] }
      | { type: 'shapes.deleted'; ids: string[] },
  },
  actions: {
    selectTool: assign(({ event }) => {
      if (event.type !== 'SELECT_TOOL') return {};
      return {
        activeTool: event.tool,
        pointerDownAt: null,
        newElement: null,
        freehandPoints: [],
        textEditingAt: null,
        editingTextShapeId: null,
      };
    }),
    recordPointerDown: assign(({ event }) => {
      if (event.type !== 'POINTER_DOWN') return {};
      return { pointerDownAt: event.point };
    }),
    startShapeDraw: assign(({ context, event }) => {
      if (event.type !== 'POINTER_DOWN') return {};
      const p = event.point;
      const tool = context.activeTool;
      let newElement: Shape | null = null;
      switch (tool) {
        case 'rectangle':
          newElement = createRectangle({ id: genId(), x: p.x, y: p.y, width: 1, height: 1 });
          break;
        case 'ellipse':
          newElement = createEllipse({ id: genId(), x: p.x, y: p.y, width: 1, height: 1 });
          break;
        case 'diamond':
          newElement = createDiamond({ id: genId(), x: p.x, y: p.y, width: 1, height: 1 });
          break;
        case 'line':
          newElement = createLine({
            id: genId(),
            x: p.x,
            y: p.y,
            points: [
              [0, 0],
              [1, 1],
            ],
          });
          break;
        case 'arrow':
          newElement = createArrow({
            id: genId(),
            x: p.x,
            y: p.y,
            points: [
              [0, 0],
              [1, 1],
            ],
          });
          break;
        default:
          break;
      }
      return { newElement };
    }),
    startFreehand: assign(({ event }) => {
      if (event.type !== 'POINTER_DOWN') return {};
      const p = event.point;
      return {
        freehandPoints: [[0, 0] as readonly [number, number]],
        newElement: createFreehand({
          id: genId(),
          x: p.x,
          y: p.y,
          points: [[0, 0]],
        }),
      };
    }),
    updateShapeDraw: assign(({ context, event }) => {
      if (event.type !== 'POINTER_MOVE') return {};
      const start = context.pointerDownAt;
      if (!start || !context.newElement) return {};
      const dx = event.point.x - start.x;
      const dy = event.point.y - start.y;
      const el = context.newElement;
      switch (el.kind) {
        case 'rectangle':
        case 'ellipse':
        case 'diamond':
          return {
            newElement: {
              ...el,
              width: Math.max(1, Math.abs(dx)),
              height: Math.max(1, Math.abs(dy)),
              x: dx < 0 ? event.point.x : start.x,
              y: dy < 0 ? event.point.y : start.y,
            },
          };
        case 'line':
        case 'arrow':
          return {
            newElement: {
              ...el,
              points: [[0, 0] as readonly [number, number], [dx, dy] as readonly [number, number]],
            },
          };
        default:
          return {};
      }
    }),
    updateFreehand: assign(({ context, event }) => {
      if (event.type !== 'POINTER_MOVE') return {};
      if (!context.pointerDownAt || !context.newElement || context.newElement.kind !== 'freehand') {
        return {};
      }
      const dx = event.point.x - context.pointerDownAt.x;
      const dy = event.point.y - context.pointerDownAt.y;
      const nextPoints = [...context.freehandPoints, [dx, dy] as readonly [number, number]];
      return {
        freehandPoints: nextPoints,
        newElement: { ...context.newElement, points: nextPoints },
      };
    }),
    startTextEditing: assign(({ event }) => {
      if (event.type !== 'POINTER_DOWN') return {};
      return { textEditingAt: event.point, editingTextShapeId: null };
    }),
    startEditingExistingText: assign(({ event }) => {
      if (event.type !== 'EDIT_TEXT_SHAPE') return {};
      return {
        textEditingAt: event.position,
        editingTextShapeId: event.shapeId,
      };
    }),
    emitCommittedShape: emit(({ context }) => {
      if (!context.newElement) {
        throw new Error('emitCommittedShape called with no newElement');
      }
      return { type: 'shape.committed' as const, shape: context.newElement };
    }),
    clearDraw: assign({
      pointerDownAt: null,
      newElement: null,
      freehandPoints: [],
    }),
    clearTextEditing: assign({ textEditingAt: null, editingTextShapeId: null }),
    trackSpaceDown: assign({ isSpacePressed: true }),
    trackSpaceUp: assign({ isSpacePressed: false }),
    applyZoom: assign(({ context, event }) => {
      if (event.type !== 'ZOOM_BY') return {};
      const oldZoom = context.camera.zoom;
      const newZoom = clamp(oldZoom * event.delta, MIN_ZOOM, MAX_ZOOM);
      if (newZoom === oldZoom) return {};
      const worldX = event.anchor.x / oldZoom + context.camera.x;
      const worldY = event.anchor.y / oldZoom + context.camera.y;
      const newCameraX = worldX - event.anchor.x / newZoom;
      const newCameraY = worldY - event.anchor.y / newZoom;
      return { camera: { x: newCameraX, y: newCameraY, zoom: newZoom } };
    }),
    resetView: assign({ camera: IDENTITY_CAMERA }),

    // --- Selection actions ---

    selectSingle: assign(({ event }) => {
      if (event.type !== 'POINTER_DOWN' || !event.hitShapeId) return {};
      return { selectedIds: [event.hitShapeId] };
    }),
    toggleInSelection: assign(({ context, event }) => {
      if (event.type !== 'POINTER_DOWN' || !event.hitShapeId) return {};
      const id = event.hitShapeId;
      const current = context.selectedIds;
      if (current.includes(id)) {
        return { selectedIds: current.filter((x) => x !== id) };
      }
      return { selectedIds: [...current, id] };
    }),
    deselectAll: assign({ selectedIds: [] }),
    setSelectAll: assign(({ event }) => {
      if (event.type !== 'SELECT_ALL') return {};
      return { selectedIds: event.shapeIds };
    }),

    beginDragOrigin: assign(() => {
      // Set later from Editor via SELECT_TOOL-style side channel...
      // Actually: we'll capture drag origins from the outside via event payload
      return {};
    }),

    startMarquee: assign(({ event }) => {
      if (event.type !== 'POINTER_DOWN') return {};
      return {
        marquee: { x: event.point.x, y: event.point.y, width: 0, height: 0 },
      };
    }),
    updateMarquee: assign(({ context, event }) => {
      if (event.type !== 'POINTER_MOVE' || !context.pointerDownAt) return {};
      const start = context.pointerDownAt;
      const x = Math.min(start.x, event.point.x);
      const y = Math.min(start.y, event.point.y);
      const width = Math.abs(event.point.x - start.x);
      const height = Math.abs(event.point.y - start.y);
      return { marquee: { x, y, width, height } };
    }),
    clearMarquee: assign({ marquee: null }),

    beginResize: assign(({ event }) => {
      if (event.type !== 'POINTER_DOWN' || event.hitHandle === null) return {};
      return { resizeHandle: event.hitHandle };
    }),
    clearResize: assign({ resizeHandle: null, resizeOriginShape: null }),
  },
  guards: {
    isSelectTool: ({ context }) => context.activeTool === 'select',
    isShapeTool: ({ context }) => {
      const t = context.activeTool;
      return (
        t === 'rectangle' || t === 'ellipse' || t === 'diamond' || t === 'line' || t === 'arrow'
      );
    },
    isFreehandTool: ({ context }) => context.activeTool === 'freehand',
    isTextTool: ({ context }) => context.activeTool === 'text',
    isPanGesture: ({ context, event }) => {
      if (event.type !== 'POINTER_DOWN') return false;
      return event.button === 1 || context.isSpacePressed;
    },
    hitAHandle: ({ event }) => {
      if (event.type !== 'POINTER_DOWN') return false;
      return event.hitHandle !== null;
    },
    hitAShape: ({ event }) => {
      if (event.type !== 'POINTER_DOWN') return false;
      return event.hitShapeId !== null && event.hitHandle === null;
    },
    isShiftClick: ({ event }) => {
      if (event.type !== 'POINTER_DOWN') return false;
      return event.shiftKey;
    },
    hasMovedEnough: ({ context, event }) => {
      if (event.type !== 'POINTER_UP') return false;
      const start = context.pointerDownAt;
      if (!start) return false;
      const dx = event.point.x - start.x;
      const dy = event.point.y - start.y;
      return Math.hypot(dx, dy) > 3;
    },
    freehandHasEnoughPoints: ({ context }) => context.freehandPoints.length > 3,
  },
}).createMachine({
  id: 'tool',
  initial: 'idle',
  context: {
    activeTool: 'select',
    pointerDownAt: null,
    newElement: null,
    freehandPoints: [],
    textEditingAt: null,
    editingTextShapeId: null,
    camera: IDENTITY_CAMERA,
    isSpacePressed: false,
    selectedIds: [],
    marquee: null,
    dragOriginShapes: {},
    resizeHandle: null,
    resizeOriginShape: null,
  },
  on: {
    SELECT_TOOL: { target: '.idle', actions: 'selectTool' },
    ESCAPE: { target: '.idle', actions: ['clearDraw', 'clearTextEditing', 'deselectAll'] },
    EDIT_TEXT_SHAPE: { target: '.editingText', actions: 'startEditingExistingText' },
    SPACE_DOWN: { actions: 'trackSpaceDown' },
    SPACE_UP: { actions: 'trackSpaceUp' },
    ZOOM_BY: { actions: 'applyZoom' },
    RESET_VIEW: { actions: 'resetView' },
    SET_CAMERA: {
      actions: assign(({ event }) => {
        if (event.type !== 'SET_CAMERA') return {};
        return { camera: event.camera };
      }),
    },
    SELECT_ALL: { actions: 'setSelectAll' },
    DESELECT: { actions: 'deselectAll' },
    DELETE_SELECTED: {
      actions: [
        emit(({ context }) => ({
          type: 'shapes.deleted' as const,
          ids: context.selectedIds,
        })),
        'deselectAll',
      ],
    },
  },
  states: {
    idle: {
      on: {
        POINTER_DOWN: [
          { guard: 'isPanGesture', target: 'panning' },
          {
            guard: 'isSelectTool',
            target: 'selectPointerDown',
            actions: 'recordPointerDown',
          },
          {
            guard: 'isShapeTool',
            target: 'drawingShape',
            actions: ['recordPointerDown', 'startShapeDraw'],
          },
          {
            guard: 'isFreehandTool',
            target: 'drawingFreehand',
            actions: ['recordPointerDown', 'startFreehand'],
          },
          {
            guard: 'isTextTool',
            target: 'editingText',
            actions: 'startTextEditing',
          },
        ],
      },
    },
    panning: {
      on: {
        POINTER_MOVE: {
          actions: assign(({ context, event }) => {
            if (event.type !== 'POINTER_MOVE') return {};
            return {
              camera: {
                ...context.camera,
                x: context.camera.x - event.screenDelta.x / context.camera.zoom,
                y: context.camera.y - event.screenDelta.y / context.camera.zoom,
              },
            };
          }),
        },
        POINTER_UP: { target: 'idle' },
      },
    },
    /**
     * Transient decision state for select-tool pointer down.
     * Branches based on what was hit.
     */
    selectPointerDown: {
      always: [
        {
          guard: 'hitAHandle',
          target: 'resizingSelection',
          actions: 'beginResize',
        },
        {
          guard: 'hitAShape',
          target: 'draggingSelection',
          actions: [
            assign(({ context, event }) => {
              if (event.type !== 'POINTER_DOWN' || !event.hitShapeId) return {};
              // Add to selection or replace
              if (event.shiftKey) {
                const current = context.selectedIds;
                if (current.includes(event.hitShapeId)) return {};
                return { selectedIds: [...current, event.hitShapeId] };
              }
              // If clicking a shape not already selected, replace selection
              if (!context.selectedIds.includes(event.hitShapeId)) {
                return { selectedIds: [event.hitShapeId] };
              }
              return {};
            }),
          ],
        },
        {
          // Clicked empty canvas — start marquee (or deselect)
          target: 'marqueeSelecting',
          actions: ['deselectAll', 'startMarquee'],
        },
      ],
    },
    draggingSelection: {
      on: {
        POINTER_MOVE: {
          actions: emit(({ event }) => {
            if (event.type !== 'POINTER_MOVE') {
              return { type: 'shapes.updated' as const, shapes: [] };
            }
            return {
              type: 'shapes.updated' as const,
              // React uses screenDelta / zoom to move selected shapes
              // We emit an intent; Editor computes the new positions.
              shapes: [],
            };
          }),
        },
        POINTER_UP: { target: 'idle' },
      },
    },
    resizingSelection: {
      on: {
        POINTER_MOVE: {
          // Similar pattern - Editor listens to context changes
          actions: [],
        },
        POINTER_UP: { target: 'idle', actions: 'clearResize' },
      },
    },
    marqueeSelecting: {
      on: {
        POINTER_MOVE: { actions: 'updateMarquee' },
        POINTER_UP: {
          target: 'idle',
          actions: 'clearMarquee',
        },
      },
    },
    drawingShape: {
      on: {
        POINTER_MOVE: { actions: 'updateShapeDraw' },
        POINTER_UP: [
          {
            guard: 'hasMovedEnough',
            target: 'idle',
            actions: ['emitCommittedShape', 'clearDraw'],
          },
          { target: 'idle', actions: 'clearDraw' },
        ],
      },
    },
    drawingFreehand: {
      on: {
        POINTER_MOVE: { actions: 'updateFreehand' },
        POINTER_UP: [
          {
            guard: 'freehandHasEnoughPoints',
            target: 'idle',
            actions: ['emitCommittedShape', 'clearDraw'],
          },
          { target: 'idle', actions: 'clearDraw' },
        ],
      },
    },
    editingText: {
      on: {
        COMMIT_TEXT: { target: 'idle', actions: 'clearTextEditing' },
        CANCEL_TEXT: { target: 'idle', actions: 'clearTextEditing' },
      },
    },
  },
});

// Re-export helpers used by the Editor
export { resizeShape };
