import { useEffect, type RefObject } from 'react';
import { renderNewElementScene, setupCanvas, type Shape } from '@canvasflow/canvas-engine';

interface UseNewElementRenderOptions {
  width: number;
  height: number;
  newElement: Shape | null;
  devicePixelRatio: number;
}

export function useNewElementRender(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseNewElementRenderOptions,
): void {
  const { width, height, newElement, devicePixelRatio } = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const ctx = setupCanvas(canvas, { width, height, devicePixelRatio });
    renderNewElementScene(ctx, canvas, { width, height, newElement });
  }, [canvasRef, width, height, newElement, devicePixelRatio]);
}
