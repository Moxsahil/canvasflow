import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { createText, hitTest, SpatialIndex, type Shape } from '@canvasflow/canvas-engine';
import { CanvasStack } from './canvas/CanvasStack';
import { DevOverlay } from './canvas/dev/DevOverlay';
import { useCanvasResize } from './canvas/hooks/useCanvasResize';
import { useDevicePixelRatio } from './canvas/hooks/useDevicePixelRatio';
import { Toolbar } from './toolbar/Toolbar';
import { TextEditor } from './text-editor/TextEditor';
import { toolMachine, resizeShape } from './machine/tool-machine';
import { useKeyboardShortcuts } from './tools/useKeyboardShortcuts';
import { hitTestHandles } from './selection/handles';
import type { Tool } from './tools/tool';
import type { Point } from './machine/tool-machine.types';

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasResize(containerRef);
  const dpr = useDevicePixelRatio();

  const [shapes, setShapes] = useState<Shape[]>([]);

  const actorRef = useActorRef(toolMachine);

  const activeTool = useSelector(actorRef, (s) => s.context.activeTool);
  const newElement = useSelector(actorRef, (s) => s.context.newElement);
  const textEditingAt = useSelector(actorRef, (s) => s.context.textEditingAt);
  const camera = useSelector(actorRef, (s) => s.context.camera);
  const isSpacePressed = useSelector(actorRef, (s) => s.context.isSpacePressed);
  const selectedIds = useSelector(actorRef, (s) => s.context.selectedIds);
  const marquee = useSelector(actorRef, (s) => s.context.marquee);

  // --- Spatial index rebuilt when shapes change ---
  const spatialIndex = useMemo(() => {
    const index = new SpatialIndex();
    index.rebuild(shapes);
    return index;
  }, [shapes]);

  // --- Refs for drag state (avoid re-render on every mouse move) ---
  const dragOriginsRef = useRef<Record<string, Shape>>({});
  const resizeOriginRef = useRef<Shape | null>(null);
  const pointerDownWorldRef = useRef<Point | null>(null);

  // --- Emit subscriptions ---
  useEffect(() => {
    const sub1 = actorRef.on('shape.committed', (emitted) => {
      setShapes((prev) => [...prev, emitted.shape]);
    });
    const sub2 = actorRef.on('shapes.deleted', (emitted) => {
      const idSet = new Set(emitted.ids);
      setShapes((prev) => prev.filter((s) => !idSet.has(s.id)));
    });
    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
    };
  }, [actorRef]);

  // --- Marquee -> selection sync (when marquee state clears, apply selection) ---
  const marqueeRef = useRef(marquee);
  useEffect(() => {
    // When marquee just cleared and we had one before, compute selection
    if (marqueeRef.current && !marquee) {
      const finalMarquee = marqueeRef.current;
      // Compute shapes that intersect the marquee
      // const intersects: string[] = [];
      // for (const s of shapes) {
      //   const b = spatialIndex; // eslint-disable-line @typescript-eslint/no-unused-vars
      //   // We'll do a simple bounds intersect
      //   // (using shape geometry inline to avoid another module hop)
      // }
      // Simpler: use the SpatialIndex API
      const ids = spatialIndex.searchRect(finalMarquee);
      if (ids.length > 0) {
        actorRef.send({ type: 'SELECT_ALL', shapeIds: ids });
      }
    }
    marqueeRef.current = marquee;
  }, [marquee, shapes, spatialIndex, actorRef]);

  // --- Pointer handlers ---
  const handlePointerDown = useCallback(
    (point: Point, _screenPoint: Point, button: number, shiftKey: boolean) => {
      pointerDownWorldRef.current = point;

      // Hit-test: shape and handle
      let hitShapeId: string | null = null;
      let hitHandle: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | null = null;

      // Only run hit-tests if the select tool is active
      if (activeTool === 'select' && !isSpacePressed && button !== 1) {
        // Handle hit-test first (only when exactly one shape selected)
        if (selectedIds.length === 1) {
          const selectedShape = shapes.find((s) => s.id === selectedIds[0]);
          if (selectedShape) {
            hitHandle = hitTestHandles(selectedShape, point.x, point.y, camera.zoom);
            if (hitHandle !== null) {
              resizeOriginRef.current = selectedShape;
            }
          }
        }
        // Shape hit-test if no handle hit
        if (hitHandle === null) {
          const hit = hitTest(shapes, spatialIndex, point.x, point.y);
          hitShapeId = hit?.id ?? null;

          // Capture drag origins if we're going to drag
          if (hit) {
            const idsToMove =
              shiftKey || selectedIds.includes(hit.id)
                ? [...new Set([...selectedIds, hit.id])]
                : [hit.id];
            const origins: Record<string, Shape> = {};
            for (const s of shapes) {
              if (idsToMove.includes(s.id)) origins[s.id] = s;
            }
            dragOriginsRef.current = origins;
          }
        }
      }

      actorRef.send({
        type: 'POINTER_DOWN',
        point,
        button,
        shiftKey,
        hitShapeId,
        hitHandle,
      });
    },
    [actorRef, activeTool, isSpacePressed, selectedIds, shapes, spatialIndex, camera.zoom],
  );

  const handlePointerMove = useCallback(
    (point: Point, _screenPoint: Point, screenDelta: Point) => {
      // Send to machine first (drives state)
      actorRef.send({ type: 'POINTER_MOVE', point, screenDelta });

      // If we're dragging a selection, update shapes directly
      const snap = actorRef.getSnapshot();
      if (snap.matches('draggingSelection') && pointerDownWorldRef.current) {
        const dx = point.x - pointerDownWorldRef.current.x;
        const dy = point.y - pointerDownWorldRef.current.y;
        const origins = dragOriginsRef.current;
        setShapes((prev) =>
          prev.map((s) => {
            const origin = origins[s.id];
            if (!origin) return s;
            return { ...s, x: origin.x + dx, y: origin.y + dy };
          }),
        );
      }

      // If we're resizing, update the one shape
      if (
        snap.matches('resizingSelection') &&
        pointerDownWorldRef.current &&
        resizeOriginRef.current
      ) {
        const dx = point.x - pointerDownWorldRef.current.x;
        const dy = point.y - pointerDownWorldRef.current.y;
        const originalShape = resizeOriginRef.current;
        const handle = snap.context.resizeHandle;
        if (handle !== null) {
          const resized = resizeShape(originalShape, handle, dx, dy);
          setShapes((prev) => prev.map((s) => (s.id === originalShape.id ? resized : s)));
        }
      }
    },
    [actorRef],
  );

  const handlePointerUp = useCallback(
    (point: Point) => {
      actorRef.send({ type: 'POINTER_UP', point });
      dragOriginsRef.current = {};
      resizeOriginRef.current = null;
      pointerDownWorldRef.current = null;
    },
    [actorRef],
  );

  const handleWheelZoom = useCallback(
    (delta: number, anchor: Point) => {
      actorRef.send({ type: 'ZOOM_BY', delta, anchor });
    },
    [actorRef],
  );

  const handleWheelPan = useCallback(
    (dx: number, dy: number) => {
      actorRef.send({ type: 'PAN_BY', dx, dy });
    },
    [actorRef],
  );

  const handleToolChange = useCallback(
    (tool: Tool) => {
      actorRef.send({ type: 'SELECT_TOOL', tool });
    },
    [actorRef],
  );

  const handleEscape = useCallback(() => {
    actorRef.send({ type: 'ESCAPE' });
  }, [actorRef]);

  const handleSpaceDown = useCallback(() => actorRef.send({ type: 'SPACE_DOWN' }), [actorRef]);
  const handleSpaceUp = useCallback(() => actorRef.send({ type: 'SPACE_UP' }), [actorRef]);

  const handleZoomIn = useCallback(() => {
    actorRef.send({ type: 'ZOOM_BY', delta: 1.2, anchor: { x: width / 2, y: height / 2 } });
  }, [actorRef, width, height]);

  const handleZoomOut = useCallback(() => {
    actorRef.send({ type: 'ZOOM_BY', delta: 0.8, anchor: { x: width / 2, y: height / 2 } });
  }, [actorRef, width, height]);

  const handleResetView = useCallback(() => actorRef.send({ type: 'RESET_VIEW' }), [actorRef]);

  const handleDelete = useCallback(() => {
    actorRef.send({ type: 'DELETE_SELECTED' });
  }, [actorRef]);

  const handleSelectAll = useCallback(() => {
    actorRef.send({ type: 'SELECT_ALL', shapeIds: shapes.map((s) => s.id) });
  }, [actorRef, shapes]);

  useKeyboardShortcuts({
    onSelectTool: handleToolChange,
    onEscape: handleEscape,
    onSpaceDown: handleSpaceDown,
    onSpaceUp: handleSpaceUp,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onResetView: handleResetView,
    onDelete: handleDelete,
    onSelectAll: handleSelectAll,
  });

  const handleCommitText = useCallback(
    (text: string) => {
      const pos = actorRef.getSnapshot().context.textEditingAt;
      if (pos && text.trim()) {
        const textShape = createText({ id: genId(), x: pos.x, y: pos.y, text });
        setShapes((prev) => [...prev, textShape]);
      }
      actorRef.send({ type: 'COMMIT_TEXT', text });
    },
    [actorRef],
  );

  const handleCancelText = useCallback(() => actorRef.send({ type: 'CANCEL_TEXT' }), [actorRef]);

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <CanvasStack
        shapes={shapes}
        newElement={newElement}
        selectedIds={selectedIds}
        marquee={marquee}
        activeTool={activeTool}
        camera={camera}
        isSpacePressed={isSpacePressed}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheelZoom={handleWheelZoom}
        onWheelPan={handleWheelPan}
      />

      <header
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e4e4e7',
          fontSize: 14,
          fontWeight: 500,
          color: '#3f3f46',
          zIndex: 10,
        }}
      >
        CanvasFlow Editor
        <span style={{ color: '#a1a1aa', fontWeight: 400, fontSize: 12 }}>
          PR #16 · select, move, resize
        </span>
      </header>

      <Toolbar activeTool={activeTool} onToolChange={handleToolChange} />

      {textEditingAt && (
        <TextEditor
          position={textEditingAt}
          onCommit={handleCommitText}
          onCancel={handleCancelText}
        />
      )}

      <DevOverlay
        shapeCount={shapes.length}
        width={width}
        height={height}
        devicePixelRatio={dpr}
        camera={camera}
      />
    </div>
  );
}
