import { useEffect, type RefObject } from 'react';
import { renderNewElementScene, setupCanvas, type Shape } from '@canvasflow/canvas-engine';
import type { Camera } from '@/machine/tool-machine.types';

interface UseNewElementRenderOptions {
  width: number;
  height: number;
  newElement: Shape | null;
  camera: Camera;
  devicePixelRatio: number;
}

export function useNewElementRender(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseNewElementRenderOptions,
): void {
  const { width, height, newElement, camera, devicePixelRatio } = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const ctx = setupCanvas(canvas, { width, height, devicePixelRatio });
    renderNewElementScene(ctx, canvas, { width, height, newElement, camera });
  }, [canvasRef, width, height, newElement, camera, devicePixelRatio]);
}
