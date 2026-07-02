import { useEffect, type RefObject } from 'react';
import { eventToCanvasPoint } from './coords';

interface UsePointerEventsOptions {
  onPointerDown: (point: { x: number; y: number }) => void;
  onPointerMove: (point: { x: number; y: number }) => void;
  onPointerUp: (point: { x: number; y: number }) => void;
}

/**
 * Attach pointer event handlers to a canvas element.
 * Uses `setPointerCapture` so we still get pointermove/pointerup events
 * when the pointer leaves the canvas mid-drag.
 */
export function usePointerEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { onPointerDown, onPointerMove, onPointerUp }: UsePointerEventsOptions,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isDown = false;
    let capturedPointerId: number | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // left button only
      isDown = true;
      capturedPointerId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      onPointerDown(eventToCanvasPoint(e, canvas));
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDown) return;
      onPointerMove(eventToCanvasPoint(e, canvas));
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      if (capturedPointerId !== null) {
        canvas.releasePointerCapture(capturedPointerId);
        capturedPointerId = null;
      }
      onPointerUp(eventToCanvasPoint(e, canvas));
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [canvasRef, onPointerDown, onPointerMove, onPointerUp]);
}
