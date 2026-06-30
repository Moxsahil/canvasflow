import { useRef } from 'react';
import type { Shape } from '@canvasflow/canvas-engine';
import { useCanvasResize } from './hooks/useCanvasResize';
import { useDevicePixelRatio } from './hooks/useDevicePixelRatio';
import { useStaticRender } from './hooks/useStaticRender';

interface CanvasStackProps {
  shapes: readonly Shape[];
}

/**
 * Three stacked canvases — the foundation of CanvasFlow's renderer.
 *
 * Bottom to top:
 *   - StaticCanvas: all finished shapes (repaints rarely)
 *   - NewElementCanvas: shape being drawn right now (PR #14)
 *   - InteractiveCanvas: selection, handles, cursors (PR #15)
 *
 * In PR #12 only the static canvas does real work. The others are
 * mounted as empty layers so the DOM structure is ready for future PRs.
 */
export function CanvasStack({ shapes }: CanvasStackProps) {
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

  return (
    <div
      ref={containerRef}
      className="canvas-stack"
      style={{
        position: 'absolute',
        inset: 0,
        background: '#fafaf9',
      }}
    >
      <canvas
        ref={staticCanvasRef}
        style={canvasStyle}
        aria-label="Static canvas — finished shapes"
      />
      <canvas
        ref={newElementCanvasRef}
        style={canvasStyle}
        aria-label="New element canvas — shape being drawn"
      />
      <canvas
        ref={interactiveCanvasRef}
        style={canvasStyle}
        aria-label="Interactive canvas — selection and cursors"
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
