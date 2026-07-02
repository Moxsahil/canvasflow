import { useRef } from 'react';
import type { Shape } from '@canvasflow/canvas-engine';
import { useCanvasResize } from './hooks/useCanvasResize';
import { useDevicePixelRatio } from './hooks/useDevicePixelRatio';
import { useStaticRender } from './hooks/useStaticRender';
import { useNewElementRender } from './hooks/useNewElementRender';
import { usePointerEvents } from '../pointer/usePointerEvents';
import type { Tool } from '@/tools/tool';

interface CanvasStackProps {
  shapes: readonly Shape[];
  newElement: Shape | null;
  activeTool: Tool;
  onPointerDown: (point: { x: number; y: number }) => void;
  onPointerMove: (point: { x: number; y: number }) => void;
  onPointerUp: (point: { x: number; y: number }) => void;
}

export function CanvasStack({
  shapes,
  newElement,
  activeTool,
  onPointerDown,
  onPointerMove,
  onPointerUp,
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
    devicePixelRatio: dpr,
  });

  useNewElementRender(newElementCanvasRef, {
    width,
    height,
    newElement,
    devicePixelRatio: dpr,
  });

  usePointerEvents(interactiveCanvasRef, {
    onPointerDown,
    onPointerMove,
    onPointerUp,
  });

  return (
    <div
      ref={containerRef}
      className="canvas-stack"
      data-tool={activeTool}
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

const canvasStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
};
