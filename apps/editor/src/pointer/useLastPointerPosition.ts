import { useCallback, useEffect, useRef } from 'react';
import type { Point } from '../machine/tool-machine.types';

/**
 * Where the pointer last was, in client coordinates, read when asked for.
 *
 * Heard on the document rather than the canvas. A menu opened over the board
 * takes the pointer from the canvas for as long as it is up, and a row in it
 * that acts "here" means where the pointer is as the row is picked — which is
 * over the menu, where the canvas hears nothing.
 *
 * Presses count as well as moves: a finger or a pen that taps without hovering
 * first reports no move before it lands.
 *
 * Kept in a ref, since it changes with every move and nothing is drawn from
 * it. Null until the pointer has been seen at all.
 */
export function useLastPointerPosition(): () => Point | null {
  const lastRef = useRef<Point | null>(null);

  useEffect(() => {
    const note = (event: PointerEvent) => {
      lastRef.current = { x: event.clientX, y: event.clientY };
    };
    // Capturing, so nothing on the way down can keep the event from here.
    const options = { capture: true, passive: true };
    document.addEventListener('pointermove', note, options);
    document.addEventListener('pointerdown', note, options);
    return () => {
      document.removeEventListener('pointermove', note, options);
      document.removeEventListener('pointerdown', note, options);
    };
  }, []);

  return useCallback(() => lastRef.current, []);
}
