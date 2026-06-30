import { useEffect, type RefObject } from 'react';
import { renderStaticScene, setupCanvas, type Shape } from '@canvasflow/canvas-engine';

interface UseStaticRenderOptions {
  width: number;
  height: number;
  shapes: readonly Shape[];
  devicePixelRatio: number;
}

/**
 * Mount the canvas-engine's static renderer on a canvas element.
 *
 * Re-renders whenever shapes change, dimensions change, or DPR changes.
 * Internal optimization: caches the context across re-renders so we
 * don't re-call setupCanvas on every paint.
 */
export function useStaticRender(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseStaticRenderOptions,
): void {
  const { width, height, shapes, devicePixelRatio } = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const ctx = setupCanvas(canvas, { width, height, devicePixelRatio });

    renderStaticScene(ctx, canvas, {
      width,
      height,
      shapes,
    });
  }, [canvasRef, width, height, shapes, devicePixelRatio]);
}
