import { useEffect, useRef, type RefObject } from 'react';
import type { Point } from '../machine/tool-machine.types';

interface UsePointerEventsOptions {
  onPointerDown: (point: Point, screenPoint: Point, button: number, shiftKey: boolean) => void;
  onPointerMove: (point: Point, screenPoint: Point, screenDelta: Point) => void;
  onPointerUp: (point: Point, screenPoint: Point) => void;
  screenToWorld: (screenX: number, screenY: number) => Point;
  eventToCanvasScreen: (event: PointerEvent) => Point;
}

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
  const lastScreenRef = useRef<Point | null>(null);
  const isDownRef = useRef(false);
  const capturedPointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      isDownRef.current = true;
      capturedPointerIdRef.current = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      const screen = eventToCanvasScreen(e);
      const world = screenToWorld(e.clientX, e.clientY);
      lastScreenRef.current = screen;
      onPointerDown(world, screen, e.button, e.shiftKey);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDownRef.current) return;
      const screen = eventToCanvasScreen(e);
      const world = screenToWorld(e.clientX, e.clientY);
      const last = lastScreenRef.current ?? screen;
      const delta = { x: screen.x - last.x, y: screen.y - last.y };
      lastScreenRef.current = screen;
      onPointerMove(world, screen, delta);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDownRef.current) return;
      isDownRef.current = false;
      if (capturedPointerIdRef.current !== null) {
        canvas.releasePointerCapture(capturedPointerIdRef.current);
        capturedPointerIdRef.current = null;
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
