import { useCallback, useEffect, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { createText, type Shape } from '@canvasflow/canvas-engine';
import { CanvasStack } from './canvas/CanvasStack';
import { DevOverlay } from './canvas/dev/DevOverlay';
import { useCanvasResize } from './canvas/hooks/useCanvasResize';
import { useDevicePixelRatio } from './canvas/hooks/useDevicePixelRatio';
import { Toolbar } from './toolbar/Toolbar';
import { TextEditor } from './text-editor/TextEditor';
import { toolMachine } from './machine/tool-machine';
import { useKeyboardShortcuts } from './tools/useKeyboardShortcuts';
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

  useEffect(() => {
    const subscription = actorRef.on('shape.committed', (emitted) => {
      setShapes((prev) => [...prev, emitted.shape]);
    });
    return () => subscription.unsubscribe();
  }, [actorRef]);

  // --- Pointer handlers ---

  const handlePointerDown = useCallback(
    (point: Point, _screenPoint: Point, button: number) => {
      actorRef.send({ type: 'POINTER_DOWN', point, button });
    },
    [actorRef],
  );
  const handlePointerMove = useCallback(
    (point: Point, _screenPoint: Point, screenDelta: Point) => {
      actorRef.send({ type: 'POINTER_MOVE', point, screenDelta });
    },
    [actorRef],
  );
  const handlePointerUp = useCallback(
    (point: Point) => {
      actorRef.send({ type: 'POINTER_UP', point });
    },
    [actorRef],
  );

  // --- Wheel handlers ---

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

  // --- Keyboard handlers ---

  const handleToolChange = useCallback(
    (tool: Tool) => {
      actorRef.send({ type: 'SELECT_TOOL', tool });
    },
    [actorRef],
  );

  const handleEscape = useCallback(() => {
    actorRef.send({ type: 'ESCAPE' });
  }, [actorRef]);

  const handleSpaceDown = useCallback(() => {
    actorRef.send({ type: 'SPACE_DOWN' });
  }, [actorRef]);

  const handleSpaceUp = useCallback(() => {
    actorRef.send({ type: 'SPACE_UP' });
  }, [actorRef]);

  const handleZoomIn = useCallback(() => {
    actorRef.send({
      type: 'ZOOM_BY',
      delta: 1.2,
      anchor: { x: width / 2, y: height / 2 },
    });
  }, [actorRef, width, height]);

  const handleZoomOut = useCallback(() => {
    actorRef.send({
      type: 'ZOOM_BY',
      delta: 0.8,
      anchor: { x: width / 2, y: height / 2 },
    });
  }, [actorRef, width, height]);

  const handleResetView = useCallback(() => {
    actorRef.send({ type: 'RESET_VIEW' });
  }, [actorRef]);

  useKeyboardShortcuts({
    onSelectTool: handleToolChange,
    onEscape: handleEscape,
    onSpaceDown: handleSpaceDown,
    onSpaceUp: handleSpaceUp,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onResetView: handleResetView,
  });

  const handleCommitText = useCallback(
    (text: string) => {
      const pos = actorRef.getSnapshot().context.textEditingAt;
      if (pos && text.trim()) {
        const textShape = createText({
          id: genId(),
          x: pos.x,
          y: pos.y,
          text,
        });
        setShapes((prev) => [...prev, textShape]);
      }
      actorRef.send({ type: 'COMMIT_TEXT', text });
    },
    [actorRef],
  );

  const handleCancelText = useCallback(() => {
    actorRef.send({ type: 'CANCEL_TEXT' });
  }, [actorRef]);

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <CanvasStack
        shapes={shapes}
        newElement={newElement}
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
          PR #15 · pan and zoom
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
