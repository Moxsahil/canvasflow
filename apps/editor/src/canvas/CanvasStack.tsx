import React, { useCallback, useRef } from 'react';
import type { Tool } from '@/tools/tool';
import type { Shape } from '@canvasflow/canvas-engine';
import type { Camera, Point } from '@/machine/tool-machine.types';
import { useCanvasResize } from './hooks/useCanvasResize';
import { useDevicePixelRatio } from './hooks/useDevicePixelRatio';
import { useStaticRender } from './hooks/useStaticRender';
import { useNewElementRender } from './hooks/useNewElementRender';
import { usePointerEvents } from '../pointer/usePointerEvents';
import { screenToWorld, eventToCanvasScreen } from '@/pointer/coords';
import { useWheelEvents } from '@/pointer/useWheelEvents';

interface CanvasStackProps {
  shapes: readonly Shape[];
  newElement: Shape | null;
  activeTool: Tool;
  camera: Camera;
  isSpacePressed: boolean;
  onPointerDown: (point: Point, screenPoint: Point, button: number) => void;
  onPointerMove: (point: Point, screenPoint: Point, screenDelta: Point) => void;
  onPointerUp: (point: Point, screenPoint: Point) => void;
  onWheelZoom: (delta: number, anchor: Point) => void;
  onWheelPan: (dx: number, dy: number) => void;
}

export function CanvasStack({
  shapes,
  newElement,
  activeTool,
  camera,
  isSpacePressed,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheelZoom,
  onWheelPan,
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
  });

  useNewElementRender(newElementCanvasRef, {
    width,
    height,
    newElement,
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

  usePointerEvents(interactiveCanvasRef, {
    onPointerDown,
    onPointerMove,
    onPointerUp,
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

  const cursorClass = isSpacePressed ? 'grabbing' : activeTool;

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
      <canvas
        ref={interactiveCanvasRef}
        style={{ ...canvasStyle, cursor: 'crosshair' }}
        aria-label="Interactive canvas"
      />
    </div>
  );
}
