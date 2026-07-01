import { useMemo, useRef } from 'react';
import {
  createRectangle,
  createEllipse,
  createDiamond,
  createLine,
  createArrow,
  createFreehand,
  createText,
  type Shape,
} from '@canvasflow/canvas-engine';
import { CanvasStack } from './canvas/CanvasStack';
import { DevOverlay } from './canvas/dev/DevOverlay';
import { useCanvasResize } from './canvas/hooks/useCanvasResize';
import { useDevicePixelRatio } from './canvas/hooks/useDevicePixelRatio';

/**
 * The Editor — full-viewport canvas application.
 *
 * In PR #13 we render a sample of all 7 shape primitives to prove
 * the renderer's exhaustiveness. Real document loading comes in PR #17.
 */
export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasResize(containerRef);
  const dpr = useDevicePixelRatio();

  const shapes = useMemo<Shape[]>(
    () => [
      createRectangle({
        id: 'demo-rect',
        x: 80,
        y: 100,
        width: 160,
        height: 100,
        fillColor: '#fef3c7',
        seed: 42,
      }),
      createEllipse({
        id: 'demo-ellipse',
        x: 280,
        y: 100,
        width: 160,
        height: 100,
        fillColor: '#dbeafe',
        seed: 43,
      }),
      createDiamond({
        id: 'demo-diamond',
        x: 480,
        y: 80,
        width: 140,
        height: 140,
        fillColor: '#fce7f3',
        seed: 44,
      }),
      createLine({
        id: 'demo-line',
        x: 80,
        y: 280,
        points: [
          [0, 0],
          [160, 80],
        ],
        seed: 45,
      }),
      createArrow({
        id: 'demo-arrow',
        x: 280,
        y: 280,
        points: [
          [0, 0],
          [160, 80],
        ],
        seed: 46,
      }),
      createFreehand({
        id: 'demo-freehand',
        x: 480,
        y: 280,
        points: [
          [0, 0],
          [20, 30],
          [50, 20],
          [80, 50],
          [110, 30],
          [140, 60],
          [160, 80],
        ],
        seed: 47,
      }),
      createText({
        id: 'demo-text',
        x: 80,
        y: 420,
        text: 'Sahil Barak',
        fontSize: 32,
        seed: 48,
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
          PR #13 · all 7 shape primitives
        </span>
      </header>

      <DevOverlay shapeCount={shapes.length} width={width} height={height} devicePixelRatio={dpr} />
    </div>
  );
}
