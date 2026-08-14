import { useCallback, useRef } from 'react';
import type { Shape } from '@canvasflow/canvas-engine';
import type { Camera, Point } from '../machine/tool-machine.types';
import type { Tool } from '../tools/tool';
import { useCanvasResize } from './hooks/useCanvasResize';
import { useDevicePixelRatio } from './hooks/useDevicePixelRatio';
import { useStaticRender } from './hooks/useStaticRender';
import { useNewElementRender } from './hooks/useNewElementRender';
import { useInteractiveRender } from './hooks/useInteractiveRender';
import { usePointerEvents } from '../pointer/usePointerEvents';
import { useWheelEvents } from '../pointer/useWheelEvents';
import { screenToWorld, eventToCanvasScreen } from '../pointer/coords';

interface CanvasStackProps {
  shapes: readonly Shape[];
  pendingErasureIds?: ReadonlySet<string>;
  newElement: Shape | null;
  selectedIds: readonly string[];
  marquee: { x: number; y: number; width: number; height: number } | null;
  activeTool: Tool;
  camera: Camera;
  isSpacePressed: boolean;
  onPointerDown: (point: Point, screenPoint: Point, button: number, shiftKey: boolean) => void;
  onPointerMove: (point: Point, screenPoint: Point, screenDelta: Point, altKey: boolean) => void;
  onPointerUp: (point: Point, screenPoint: Point) => void;
  onDoubleClick: (point: Point, screenPoint: Point) => void;
  onWheelZoom: (delta: number, anchor: Point) => void;
  onWheelPan: (dx: number, dy: number) => void;
  isPanning: boolean;
}

export function CanvasStack({
  shapes,
  pendingErasureIds,
  newElement,
  selectedIds,
  marquee,
  activeTool,
  camera,
  isSpacePressed,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onWheelZoom,
  onWheelPan,
  isPanning,
}: CanvasStackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const newElementCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactiveCanvasRef = useRef<HTMLCanvasElement>(null);

  const { width, height } = useCanvasResize(containerRef);
  const dpr = useDevicePixelRatio();

  useStaticRender(staticCanvasRef, {
    width,
    height,
    shapes,
    camera,
    devicePixelRatio: dpr,
    pendingErasureIds,
  });
  useNewElementRender(newElementCanvasRef, {
    width,
    height,
    newElement,
    camera,
    devicePixelRatio: dpr,
  });
  useInteractiveRender(interactiveCanvasRef, {
    width,
    height,
    shapes,
    selectedIds,
    marquee,
    camera,
    devicePixelRatio: dpr,
  });

  const screenToWorldFn = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = interactiveCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      return screenToWorld(screenX, screenY, canvas, camera);
    },
    [camera],
  );

  const eventToCanvasScreenFn = useCallback((event: PointerEvent | WheelEvent) => {
    const canvas = interactiveCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return eventToCanvasScreen(event as PointerEvent, canvas);
  }, []);

  const handlePointerDown = useCallback(
    (point: Point, screenPoint: Point, button: number, shiftKey: boolean) => {
      onPointerDown(point, screenPoint, button, shiftKey);
    },
    [onPointerDown],
  );

  usePointerEvents(interactiveCanvasRef, {
    onPointerDown: handlePointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    screenToWorld: screenToWorldFn,
    eventToCanvasScreen: eventToCanvasScreenFn,
  });

  useWheelEvents(interactiveCanvasRef, {
    onZoom: onWheelZoom,
    onPan: onWheelPan,
    eventToCanvasScreen: eventToCanvasScreenFn,
  });

  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  };

  // Cursor priority: space-pan > active-pan > tool default
  let cursorClass: string;
  if (isSpacePressed || isPanning) {
    cursorClass = 'grabbing';
  } else if (activeTool === 'hand') {
    cursorClass = 'grab';
  } else {
    cursorClass = activeTool;
  }

  return (
    <div
      ref={containerRef}
      className="canvas-stack"
      data-tool={cursorClass}
      style={{
        position: 'absolute',
        inset: 0,
        background: '#fafaf9',
      }}
    >
      <canvas ref={staticCanvasRef} style={canvasStyle} aria-label="Static canvas" />
      <canvas ref={newElementCanvasRef} style={canvasStyle} aria-label="New element canvas" />
      <canvas ref={interactiveCanvasRef} style={canvasStyle} aria-label="Interactive canvas" />
    </div>
  );
}
