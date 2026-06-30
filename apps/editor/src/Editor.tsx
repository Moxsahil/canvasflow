import { useMemo } from 'react';
import { createRectangle, type Shape } from '@canvasflow/canvas-engine';
import { CanvasStack } from './canvas/CanvasStack';
import { DevOverlay } from './canvas/dev/DevOverlay';
import { useCanvasResize } from './canvas/hooks/useCanvasResize';
import { useDevicePixelRatio } from './canvas/hooks/useDevicePixelRatio';
import { useRef } from 'react';

/**
 * The Editor — full-viewport canvas application.
 *
 * In PR #12 this just renders a hardcoded test rectangle to prove the
 * full pipeline (canvas-engine → React → browser) works end-to-end.
 *
 * Real document loading comes in PR #17 (Yjs integration).
 */
export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasResize(containerRef);
  const dpr = useDevicePixelRatio();

  // PR #12 test scene: one hand-drawn rectangle.
  // Replace with real document loading in PR #17.
  const shapes = useMemo<Shape[]>(
    () => [
      createRectangle({
        id: 'demo-rectangle',
        x: 120,
        y: 100,
        width: 280,
        height: 160,
        strokeColor: '#1e293b',
        fillColor: '#fef3c7',
        strokeWidth: 2,
        seed: 42, // stable seed so render is deterministic
      }),
    ],
    [],
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      <CanvasStack shapes={shapes} />

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
        }}
      >
        CanvasFlow Editor
        <span style={{ color: '#a1a1aa', fontWeight: 400, fontSize: 12 }}>
          PR #12 · scaffold render
        </span>
      </header>

      <DevOverlay shapeCount={shapes.length} width={width} height={height} devicePixelRatio={dpr} />
    </div>
  );
}
