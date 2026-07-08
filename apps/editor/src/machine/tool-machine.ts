import { assign, emit, setup } from 'xstate';
import {
  createArrow,
  createDiamond,
  createEllipse,
  createFreehand,
  createLine,
  createRectangle,
  type Shape,
} from '@canvasflow/canvas-engine';
import {
  IDENTITY_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
  type ToolMachineContext,
  type ToolMachineEvent,
} from './tool-machine.types';

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const toolMachine = setup({
  types: {
    context: {} as ToolMachineContext,
    events: {} as ToolMachineEvent,
    emitted: {} as { type: 'shape.committed'; shape: Shape },
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
      return { textEditingAt: event.point };
    }),
    /**
     * Emit the committed shape so React can add it to the scene.
     * Emit uses XState 5's emit() API — subscribers receive it via
     * actor.on('shape.committed', handler).
     */
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
    clearTextEditing: assign({ textEditingAt: null }),

    // --- New: camera actions ---

    trackSpaceDown: assign({ isSpacePressed: true }),
    trackSpaceUp: assign({ isSpacePressed: false }),

    /**
     * Pan the camera by a screen-pixel delta. Divide by zoom because a
     * 100-pixel pan at 50% zoom should move the world by 200 units.
     */

    applyPan: assign(({ context, event }) => {
      if (event.type !== 'PAN_BY') return {};
      return {
        camera: {
          ...context.camera,
          x: context.camera.x - event.dx / context.camera.zoom,
          y: context.camera.y - event.dy / context.camera.zoom,
        },
      };
    }),

    /**
     * Zoom around a screen-space anchor point. Math:
     * - Convert anchor from screen to world using current zoom
     * - Change zoom (clamped)
     * - Adjust camera so the same world point is still under the anchor
     */

    applyZoom: assign(({ context, event }) => {
      if (event.type !== 'ZOOM_BY') return {};
      const oldZoom = context.camera.zoom;
      const newZoom = clamp(oldZoom * event.delta, MIN_ZOOM, MAX_ZOOM);
      if (newZoom === oldZoom) return {};

      // World point under anchor before zoom change
      const worldX = event.anchor.x / oldZoom + context.camera.x;
      const worldY = event.anchor.y / oldZoom + context.camera.y;

      // After zoom change, the same world point should still be under the anchor
      const newCameraX = worldX - event.anchor.x / newZoom;
      const newCameraY = worldY - event.anchor.y / newZoom;

      return {
        camera: {
          x: newCameraX,
          y: newCameraY,
          zoom: newZoom,
        },
      };
    }),
    resetView: assign({ camera: IDENTITY_CAMERA }),
  },
  guards: {
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
      // Middle mouse button, OR space held while left-clicking
      return event.button === 1 || context.isSpacePressed;
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
    camera: IDENTITY_CAMERA,
    isSpacePressed: false,
  },
  on: {
    SELECT_TOOL: { target: '.idle', actions: 'selectTool' },
    ESCAPE: { target: '.idle', actions: ['clearDraw', 'clearTextEditing'] },
    SPACE_DOWN: { actions: 'trackSpaceDown' },
    SPACE_UP: { actions: 'trackSpaceUp' },
    ZOOM_BY: { actions: 'applyZoom' },
    RESET_VIEW: { actions: 'resetView' },
  },
  states: {
    idle: {
      on: {
        POINTER_DOWN: [
          {
            guard: 'isPanGesture',
            target: 'panning',
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
    drawingShape: {
      on: {
        POINTER_MOVE: { actions: 'updateShapeDraw' },
        POINTER_UP: [
          {
            guard: 'hasMovedEnough',
            target: 'idle',
            // Order matters: emit BEFORE clearDraw so the emit callback
            // sees the newElement in context.
            actions: ['emitCommittedShape', 'clearDraw'],
          },
          {
            target: 'idle',
            actions: 'clearDraw',
          },
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
          {
            target: 'idle',
            actions: 'clearDraw',
          },
        ],
      },
    },
    editingText: {
      on: {
        COMMIT_TEXT: {
          target: 'idle',
          actions: 'clearTextEditing',
        },
        CANCEL_TEXT: {
          target: 'idle',
          actions: 'clearTextEditing',
        },
      },
    },
  },
});
