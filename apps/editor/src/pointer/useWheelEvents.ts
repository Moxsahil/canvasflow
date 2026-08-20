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

/**
 * Browsers may report wheel deltas in pixels, lines, or pages. Firefox on
 * Windows commonly reports lines, where a deltaY of 3 means three lines rather
 * than three pixels — a hundredfold difference in intent.
 */
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;

/**
 * How hard one unit of scroll pushes the zoom.
 *
 * Applied through Math.exp so the result is a *ratio*, never a negative or zero
 * scale factor. The previous form was `1 - deltaY * 0.01`, which was tuned for
 * trackpad pinches (deltaY of 1–10) and collapsed on a mouse wheel: one notch
 * of deltaY 100 produced a factor of exactly 0, and `zoom * 0` clamped straight
 * to the 10% minimum. Zooming out with a wheel jumped to 10% every time.
 */
const ZOOM_SENSITIVITY = 0.0015;

/** No single event may zoom further than this, however large the delta. */
const MAX_STEP_PX = 200;

export function normalizeDelta(value: number, deltaMode: number): number {
  if (deltaMode === 1) return value * LINE_HEIGHT_PX;
  if (deltaMode === 2) return value * PAGE_HEIGHT_PX;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * The multiplier one wheel event applies to the current zoom.
 *
 * Exported for tests: this is pure arithmetic whose failure mode is invisible
 * in review — the previous version looked reasonable and silently produced a
 * factor of zero on the most common input there is.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const stepped = clamp(normalizeDelta(deltaY, deltaMode), -MAX_STEP_PX, MAX_STEP_PX);
  return Math.exp(-stepped * ZOOM_SENSITIVITY);
}

export function useWheelEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { onZoom, onPan, eventToCanvasScreen }: UseWheelEventsOptions,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const dx = normalizeDelta(e.deltaX, e.deltaMode);
      const dy = normalizeDelta(e.deltaY, e.deltaMode);

      // Modifier (Ctrl on Windows/Linux, Cmd on Mac) OR trackpad pinch (ctrlKey synthesized)
      const isZoom = e.ctrlKey || e.metaKey;

      if (isZoom) {
        // Exponential, so the factor stays positive and one notch is one step
        // regardless of how large a delta the device reports. Negative deltaY
        // (scroll up) zooms in.
        onZoom(wheelZoomFactor(e.deltaY, e.deltaMode), eventToCanvasScreen(e));
      } else {
        onPan(-dx, -dy);
      }
    };

    // passive: false so we can call preventDefault
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [canvasRef, onZoom, onPan, eventToCanvasScreen]);
}
