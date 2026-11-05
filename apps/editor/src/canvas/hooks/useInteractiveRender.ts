import { useEffect, type RefObject } from 'react';
import {
  renderInteractiveScene,
  setupCanvas,
  type BindingHint,
  type Rect,
  type Shape,
  type SnapGuide,
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
  /** Alignment evidence for the gesture in progress, drawn over it. */
  snapGuides?: readonly SnapGuide[];
  /** The point handle under the pointer, which reveals the hidden ones. */
  hoveredHandleId?: string | null;
  /** Locked shapes: selected ones are outlined dashed, with no handles. */
  lockedIds?: ReadonlySet<string>;
  /** The locked shapes whose padlock is up, outlined in grey. */
  lockHighlightIds?: readonly string[];
  /** Where an arrow end being dragged would attach, outlined and marked. */
  bindingHint?: BindingHint | null;
  darkMode?: boolean;
  /** The resize handles' size in screen pixels; the engine's default if left out. */
  handleSize?: number;
  /** The selection's colour: the accent picked in Settings. */
  selectionColor?: string;
  /** Goes up when a font arrives, which moves the outlines of words set in it. */
  fontRevision?: number;
}

export function useInteractiveRender(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseInteractiveRenderOptions,
): void {
  const {
    width,
    height,
    shapes,
    selectedIds,
    marquee,
    camera,
    devicePixelRatio,
    search,
    snapGuides,
    hoveredHandleId,
    lockedIds,
    lockHighlightIds,
    bindingHint,
    darkMode,
    handleSize,
    selectionColor,
    fontRevision,
  } = options;

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
      snapGuides,
      hoveredHandleId,
      lockedIds,
      lockHighlightIds,
      bindingHint,
      darkMode,
      handleSize,
      selectionColor,
    });
  }, [
    canvasRef,
    width,
    height,
    shapes,
    selectedIds,
    marquee,
    camera,
    devicePixelRatio,
    search,
    snapGuides,
    hoveredHandleId,
    lockedIds,
    lockHighlightIds,
    bindingHint,
    darkMode,
    handleSize,
    selectionColor,
    fontRevision,
  ]);
}
