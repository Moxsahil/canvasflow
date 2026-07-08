import { useEffect, type RefObject } from 'react';
import type { Point } from '../machine/tool-machine.types';

interface UseWheelEventsOptions {
  onZoom: (delta: number, anchor: Point) => void;
  onPan: (dx: number, dy: number) => void;
  eventToCanvasScreen: (event: WheelEvent) => Point;
}

/**
 * Wheel events cover:
 *   - Mouse wheel scroll (deltaY, ctrlKey: false) → pan
 *   - Mouse wheel + Cmd/Ctrl → zoom
 *   - Trackpad two-finger swipe (deltaX + deltaY, ctrlKey: false) → pan
 *   - Trackpad pinch (deltaY, ctrlKey: true — browsers synthesize this!) → zoom
 */
export function useWheelEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { onZoom, onPan, eventToCanvasScreen }: UseWheelEventsOptions,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Modifier (Ctrl on Windows/Linux, Cmd on Mac) OR trackpad pinch (ctrlKey synthesized)
      const isZoom = e.ctrlKey || e.metaKey;

      if (isZoom) {
        // Zoom factor: 1 + small delta. Negative deltaY = zoom in.
        // Trackpad pinch fires many small events; scale accordingly.
        const zoomDelta = 1 - e.deltaY * 0.01;
        onZoom(zoomDelta, eventToCanvasScreen(e));
      } else {
        // Pan: for a mouse wheel deltaY is large; for trackpad it's small
        onPan(-e.deltaX, -e.deltaY);
      }
    };

    // passive: false so we can call preventDefault
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [canvasRef, onZoom, onPan, eventToCanvasScreen]);
}
