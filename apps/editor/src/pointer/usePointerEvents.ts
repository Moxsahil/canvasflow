import { useEffect, useRef, type RefObject } from 'react';
import type { Point } from '../machine/tool-machine.types';

interface UsePointerEventsOptions {
  onPointerDown: (point: Point, screenPoint: Point, button: number, shiftKey: boolean) => void;
  onPointerMove: (point: Point, screenPoint: Point, screenDelta: Point) => void;
  onPointerUp: (point: Point, screenPoint: Point) => void;
  onDoubleClick: (point: Point, screenPoint: Point) => void;
  screenToWorld: (screenX: number, screenY: number) => Point;
  eventToCanvasScreen: (event: PointerEvent) => Point;
}

export function usePointerEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
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
      e.preventDefault();
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

    const handleDoubleClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // eventToCanvasScreen only reads clientX/clientY, which MouseEvent and
      // PointerEvent share — safe to reuse across both event types.
      const screen = eventToCanvasScreen(e as unknown as PointerEvent);
      const world = screenToWorld(e.clientX, e.clientY);
      onDoubleClick(world, screen);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('dblclick', handleDoubleClick);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [
    canvasRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    screenToWorld,
    eventToCanvasScreen,
  ]);
}
