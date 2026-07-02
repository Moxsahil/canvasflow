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

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasResize(containerRef);
  const dpr = useDevicePixelRatio();

  const [shapes, setShapes] = useState<Shape[]>([]);

  // Actor ref (not useMachine) so we can subscribe to emitted events.
  const actorRef = useActorRef(toolMachine);

  // Selector hooks so we re-render on the specific context fields we care about.
  const activeTool = useSelector(actorRef, (s) => s.context.activeTool);
  const newElement = useSelector(actorRef, (s) => s.context.newElement);
  const textEditingAt = useSelector(actorRef, (s) => s.context.textEditingAt);

  // Subscribe to shape commits and add them to the scene.
  useEffect(() => {
    const subscription = actorRef.on('shape.committed', (emitted) => {
      setShapes((prev) => [...prev, emitted.shape]);
    });
    return () => subscription.unsubscribe();
  }, [actorRef]);

  const handlePointerDown = useCallback(
    (point: { x: number; y: number }) => {
      actorRef.send({ type: 'POINTER_DOWN', point });
    },
    [actorRef],
  );
  const handlePointerMove = useCallback(
    (point: { x: number; y: number }) => {
      actorRef.send({ type: 'POINTER_MOVE', point });
    },
    [actorRef],
  );
  const handlePointerUp = useCallback(
    (point: { x: number; y: number }) => {
      actorRef.send({ type: 'POINTER_UP', point });
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

  useKeyboardShortcuts({
    onSelectTool: handleToolChange,
    onEscape: handleEscape,
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
          PR #14 · draw with any tool
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

      <DevOverlay shapeCount={shapes.length} width={width} height={height} devicePixelRatio={dpr} />
    </div>
  );
}
