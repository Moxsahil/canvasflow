import { assign, emit, setup } from 'xstate';
import {
  createArrow,
  createDiamond,
  createEllipse,
  createFrame,
  createFreehand,
  createLine,
  createRectangle,
  recogniseStroke,
  shapeBounds,
  type Shape,
} from '@canvasflow/canvas-engine';
import { sketchPreview, sketchShape, sketchStroke } from './sketch-shape';
import {
  DEFAULT_ITEM_STYLE,
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

  // For rect/ellipse/diamond/image
  const shape = original as typeof original & { width: number; height: number };
  let x = shape.x;
  let y = shape.y;
  let width = shape.width;
  let height = shape.height;

  // Corners on an image keep its proportions. Dragging a corner reads as
  // "make this bigger", not "distort this", and a stretched photograph is
  // almost never what was meant. The edge handles stay free, so deliberately
  // squashing one is still one drag away.
  const lockAspect =
    original.kind === 'image' && (handle === 0 || handle === 2 || handle === 4 || handle === 6);

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

  if (lockAspect && original.kind === 'image') {
    // Driven by the source dimensions rather than the current box, so repeated
    // corner drags converge on the true ratio instead of compounding whatever
    // distortion an earlier edge drag left behind.
    const ratio = original.naturalHeight / original.naturalWidth || 1;
    // The larger of the two changes wins, so the image tracks the pointer on
    // whichever axis the user is actually pulling.
    if (Math.abs(width - shape.width) >= Math.abs(height - shape.height)) {
      const next = width * ratio;
      if (handle === 0 || handle === 2) y += height - next;
      height = next;
    } else {
      const next = height / ratio;
      if (handle === 0 || handle === 6) x += width - next;
      width = next;
    }
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
        sketchPoints: [],
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
      const style = context.itemStyle;
      let newElement: Shape | null = null;
      switch (tool) {
        case 'rectangle':
          newElement = createRectangle({
            id: genId(),
            x: p.x,
            y: p.y,
            width: 1,
            height: 1,
            ...style,
          });
          break;
        case 'ellipse':
          newElement = createEllipse({
            id: genId(),
            x: p.x,
            y: p.y,
            width: 1,
            height: 1,
            ...style,
          });
          break;
        case 'diamond':
          newElement = createDiamond({
            id: genId(),
            x: p.x,
            y: p.y,
            width: 1,
            height: 1,
            ...style,
          });
          break;
        // Deliberately not given the current item style. A frame is
        // scaffolding for the work rather than part of it, so inheriting
        // whatever colour and roughness the last shape was drawn with would
        // produce containers that read as drawing.
        case 'frame':
          newElement = createFrame({ id: genId(), x: p.x, y: p.y, width: 1, height: 1 });
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
            ...style,
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
            ...style,
          });
          break;
        default:
          break;
      }
      return { newElement };
    }),
    startFreehand: assign(({ context, event }) => {
      if (event.type !== 'POINTER_DOWN') return {};
      const p = event.point;
      return {
        freehandPoints: [[0, 0] as readonly [number, number]],
        newElement: createFreehand({
          id: genId(),
          x: p.x,
          y: p.y,
          points: [[0, 0]],
          ...context.itemStyle,
        }),
      };
    }),
    startSketch: assign(({ context, event }) => {
      if (event.type !== 'POINTER_DOWN') return {};
      const points = [[event.point.x, event.point.y] as readonly [number, number]];
      return {
        sketchPoints: points,
        newElement: sketchPreview(points, null, genId(), context.itemStyle),
      };
    }),
    updateSketch: assign(({ context, event }) => {
      if (event.type !== 'POINTER_MOVE' || !context.newElement) return {};
      const points = [
        ...context.sketchPoints,
        [event.point.x, event.point.y] as readonly [number, number],
      ];
      return {
        sketchPoints: points,
        newElement: sketchPreview(
          points,
          recogniseStroke(points, context.camera.zoom),
          context.newElement.id,
          context.itemStyle,
        ),
      };
    }),
    /**
     * Settle the stroke into whatever is about to be committed: the shape it
     * was read as, or the stroke itself when it was read as nothing. The tool
     * never eats a gesture — a stroke it cannot make sense of is still ink.
     */
    resolveSketch: assign(({ context }) => {
      const points = context.sketchPoints;
      const id = genId();
      const verdict = recogniseStroke(points, context.camera.zoom);
      return {
        newElement: verdict
          ? sketchShape(verdict, id, context.itemStyle)
          : sketchStroke(points, id, context.itemStyle),
      };
    }),
    markForErase: assign(({ context, event }) => {
      if (event.type !== 'ERASE_MARK') return {};
      // Alt takes shapes back out of the pending set, so a slip can be undone
      // without abandoning the whole stroke.
      const pending = new Set(context.erasePending);
      for (const id of event.ids) {
        if (event.restore) pending.delete(id);
        else pending.add(id);
      }
      return { erasePending: [...pending] };
    }),
    clearErasePending: assign({ erasePending: [] }),
    setItemStyle: assign(({ context, event }) => {
      if (event.type !== 'SET_ITEM_STYLE') return {};
      return { itemStyle: { ...context.itemStyle, ...event.style } };
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
        case 'frame':
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
        // Not sized by dragging a box: freehand tracks the pointer itself,
        // text is placed by a click and sized by what is typed into it, and an
        // image arrives at its own size from the picker.
        case 'freehand':
        case 'text':
        case 'image':
          return {};
        default: {
          // Every kind is listed above, so this is unreachable — and a new
          // box-like kind added to the union now fails to compile here rather
          // than silently refusing to grow while it is being drawn, which is
          // exactly how the frame shipped one pixel wide.
          const unhandled: never = el;
          void unhandled;
          return {};
        }
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
      sketchPoints: [],
    }),
    clearTextEditing: assign({ textEditingAt: null, editingTextShapeId: null }),
    trackSpaceDown: assign({ isSpacePressed: true }),
    trackSpaceUp: assign({ isSpacePressed: false }),
    applyPan: assign(({ context, event }) => {
      if (event.type !== 'PAN_BY') return {};
      // Screen pixels, so the world distance covered shrinks as you zoom in.
      // Same sign convention as drag-panning: the camera moves against the
      // delta, so the content follows the gesture.
      return {
        camera: {
          ...context.camera,
          x: context.camera.x - event.dx / context.camera.zoom,
          y: context.camera.y - event.dy / context.camera.zoom,
        },
      };
    }),
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
        t === 'rectangle' ||
        t === 'ellipse' ||
        t === 'diamond' ||
        t === 'line' ||
        t === 'arrow' ||
        t === 'frame'
      );
    },
    isFreehandTool: ({ context }) => context.activeTool === 'freehand',
    isSketchTool: ({ context }) => context.activeTool === 'sketch',
    isTextTool: ({ context }) => context.activeTool === 'text',
    isEraserTool: ({ context }) => context.activeTool === 'eraser',
    isPanGesture: ({ context, event }) => {
      if (event.type !== 'POINTER_DOWN') return false;
      return event.button === 1 || context.isSpacePressed || context.activeTool === 'hand';
    },
    isHandTool: ({ context }) => context.activeTool === 'hand',
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
    // Same bar as a freehand stroke, since it is the same gesture: fewer
    // samples than this is a tap or a slip, and the tool has nothing to say
    // about it either way.
    sketchHasEnoughPoints: ({ context }) => context.sketchPoints.length > 3,
  },
}).createMachine({
  id: 'tool',
  initial: 'idle',
  context: {
    activeTool: 'select',
    pointerDownAt: null,
    newElement: null,
    freehandPoints: [],
    sketchPoints: [],
    textEditingAt: null,
    editingTextShapeId: null,
    camera: IDENTITY_CAMERA,
    isSpacePressed: false,
    selectedIds: [],
    marquee: null,
    dragOriginShapes: {},
    resizeHandle: null,
    resizeOriginShape: null,
    itemStyle: DEFAULT_ITEM_STYLE,
    erasePending: [],
  },
  on: {
    SELECT_TOOL: { target: '.idle', actions: 'selectTool' },
    SET_ITEM_STYLE: { actions: 'setItemStyle' },
    ESCAPE: { target: '.idle', actions: ['clearDraw', 'clearTextEditing', 'deselectAll'] },
    EDIT_TEXT_SHAPE: { target: '.editingText', actions: 'startEditingExistingText' },
    SPACE_DOWN: { actions: 'trackSpaceDown' },
    SPACE_UP: { actions: 'trackSpaceUp' },
    PAN_BY: { actions: 'applyPan' },
    ZOOM_BY: { actions: 'applyZoom' },
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
            guard: 'isSketchTool',
            target: 'sketching',
            actions: ['recordPointerDown', 'startSketch'],
          },
          {
            guard: 'isTextTool',
            target: 'editingText',
            actions: 'startTextEditing',
          },
          {
            guard: 'isEraserTool',
            target: 'erasing',
            actions: ['recordPointerDown', 'clearErasePending'],
          },
        ],
      },
    },
    /**
     * An eraser stroke in progress. Shapes accumulate in `erasePending` and
     * only leave the document on pointer up, so the whole stroke is a single
     * undo step rather than one per shape swept.
     */
    erasing: {
      on: {
        ERASE_MARK: { actions: 'markForErase' },
        POINTER_UP: {
          target: 'idle',
          actions: [
            emit(({ context }) => ({
              type: 'shapes.deleted' as const,
              ids: context.erasePending,
            })),
            'clearErasePending',
          ],
        },
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
    /**
     * A rough stroke being traced for the shape it is meant to be.
     *
     * Unlike every other drawing state here, what is being made is not decided
     * until the gesture ends: `newElement` carries whatever the stroke reads as
     * so far, and is settled once on release.
     */
    sketching: {
      on: {
        POINTER_MOVE: { actions: 'updateSketch' },
        POINTER_UP: [
          {
            guard: 'sketchHasEnoughPoints',
            target: 'idle',
            actions: ['resolveSketch', 'emitCommittedShape', 'clearDraw'],
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
