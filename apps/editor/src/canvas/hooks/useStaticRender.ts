import { useEffect, type RefObject } from 'react';
import {
  renderStaticScene,
  setupCanvas,
  type ImageSource,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { Camera } from '../../machine/tool-machine.types';

interface UseStaticRenderOptions {
  width: number;
  height: number;
  shapes: readonly Shape[];
  camera: Camera;
  devicePixelRatio: number;
  /** Shapes the eraser has marked; drawn faded until the stroke commits. */
  pendingErasureIds?: ReadonlySet<string>;
  /** Frames whose name is open for editing: label suppressed, border highlighted. */
  editingFrameIds?: ReadonlySet<string>;
  editingArrowLabelId?: string;
  /** Decoded image bitmaps. */
  images?: ImageSource;
  /**
   * Bumped whenever a decode finishes. The cache is a stable object, so nothing
   * in the dependency list would otherwise change when an image lands — this is
   * what turns "bytes arrived" into a repaint.
   */
  imageRevision?: number;
  /**
   * Which board these shapes are being painted on. Required, not optional with
   * a safe-looking default, because every layer that paints a shape has to be
   * given the same answer — a layer left to assume one paints the default
   * stroke as near-black on a near-black ground, and says nothing about it.
   */
  darkMode: boolean;
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
  const {
    width,
    height,
    shapes,
    camera,
    devicePixelRatio,
    pendingErasureIds,
    editingFrameIds,
    editingArrowLabelId,
    images,
    imageRevision,
    darkMode,
  } = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const ctx = setupCanvas(canvas, { width, height, devicePixelRatio });

    renderStaticScene(ctx, canvas, {
      width,
      height,
      shapes,
      camera,
      pendingErasureIds,
      editingFrameIds,
      editingArrowLabelId,
      images,
      darkMode,
    });
  }, [
    canvasRef,
    width,
    height,
    shapes,
    camera,
    devicePixelRatio,
    pendingErasureIds,
    editingFrameIds,
    editingArrowLabelId,
    images,
    imageRevision,
    darkMode,
  ]);
}
