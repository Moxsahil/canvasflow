import { useEffect, useRef, type RefObject } from 'react';
import type { Point } from '@/machine/tool-machine.types';

interface UsePointerEventsOptions {
  onPointerDown: (point: Point, screenPoint: Point, button: number) => void;
  onPointerMove: (point: Point, screenPoint: Point, screenDelta: Point) => void;
  onPointerUp: (point: Point, screenPoint: Point) => void;
  screenToWorld: (screenX: number, screenY: number) => Point;
  eventToCanvasScreen: (event: PointerEvent) => Point;
}

/**
 * Attach pointer event handlers to a canvas element.
 * Uses `setPointerCapture` so we still get pointermove/pointerup events
 * when the pointer leaves the canvas mid-drag.
 */
export function usePointerEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    screenToWorld,
    eventToCanvasScreen,
  }: UsePointerEventsOptions,
): void {
  // Track last screen position to compute deltas for pans
  const lastScreenRef = useRef<Point | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isDown = false;
    let capturedPointerId: number | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      // Allow left (0) or middle (1) mouse button
      if (e.button !== 0 && e.button !== 1) return; // left button only
      isDown = true;
      capturedPointerId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      const screen = eventToCanvasScreen(e);
      const world = screenToWorld(e.clientX, e.clientY);
      lastScreenRef.current = screen;
      onPointerDown(world, screen, e.button);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDown) return;
      const screen = eventToCanvasScreen(e);
      const world = screenToWorld(e.clientX, e.clientY);
      const last = lastScreenRef.current ?? screen;
      const delta = { x: screen.x - last.x, y: screen.y - last.y };
      lastScreenRef.current = screen;
      onPointerMove(world, screen, delta);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      if (capturedPointerId !== null) {
        canvas.releasePointerCapture(capturedPointerId);
        capturedPointerId = null;
      }
      lastScreenRef.current = null;
      const screen = eventToCanvasScreen(e);
      const world = screenToWorld(e.clientX, e.clientY);
      onPointerUp(world, screen);
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
  }, [canvasRef, onPointerDown, onPointerMove, onPointerUp, screenToWorld, eventToCanvasScreen]);
}
