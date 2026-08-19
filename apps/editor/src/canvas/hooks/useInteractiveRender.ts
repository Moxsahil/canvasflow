import { useEffect, type RefObject } from 'react';
import {
  renderInteractiveScene,
  setupCanvas,
  type Rect,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { Camera } from '../../machine/tool-machine.types';

interface UseInteractiveRenderOptions {
  width: number;
  height: number;
  shapes: readonly Shape[];
  selectedIds: readonly string[];
  marquee: { x: number; y: number; width: number; height: number } | null;
  camera: Camera;
  devicePixelRatio: number;
  /** Find-on-canvas highlights, drawn beneath the selection UI. */
  search?: { rects: readonly Rect[]; focusedRects: readonly Rect[] };
}

export function useInteractiveRender(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseInteractiveRenderOptions,
): void {
  const { width, height, shapes, selectedIds, marquee, camera, devicePixelRatio, search } = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const ctx = setupCanvas(canvas, { width, height, devicePixelRatio });
    renderInteractiveScene(ctx, canvas, {
      width,
      height,
      shapes,
      selectedIds,
      marquee,
      camera,
      search,
    });
  }, [canvasRef, width, height, shapes, selectedIds, marquee, camera, devicePixelRatio, search]);
}
