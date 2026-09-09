import { useEffect, useRef, type RefObject } from 'react';
import type { Point } from '../../machine/tool-machine.types';
import { edgeProximity, edgeScrollPush, isNearEdge } from '../edge-scroll';

interface UseEdgeScrollOptions {
  /**
   * Whether a gesture that can carry the board is running. The loop exists
   * only while this holds, so a board sitting idle schedules no frames.
   */
  readonly active: boolean;
  readonly width: number;
  readonly height: number;
  /**
   * Where the pointer last was within the canvas, in screen pixels — a ref
   * rather than a value because it changes many times a second and nothing
   * here should re-render for it.
   */
  readonly pointRef: RefObject<Point | null>;
  /** Move the view by this many screen pixels. */
  readonly onScroll: (dx: number, dy: number) => void;
}

/**
 * Keeps the view moving while a drag is held against the edge of the canvas.
 *
 * A frame loop rather than something driven by pointer events, because the
 * gesture it serves is one where the pointer has stopped moving: it is pressed
 * into a corner and waiting for the board to catch up. No events would arrive
 * to act on.
 */
export function useEdgeScroll({
  active,
  width,
  height,
  pointRef,
  onScroll,
}: UseEdgeScrollOptions): void {
  // Read through a ref so the loop can call the latest one without listing it
  // as a dependency. It is rebuilt as the document changes, which during a drag
  // is every frame — restarting the effect that often would reset the hold
  // below on each one, and the scroll would never outlast its own delay.
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

  useEffect(() => {
    if (!active) return;

    let frame = 0;
    let last = performance.now();
    /** How long the pointer has sat in a band, cleared whenever it leaves one. */
    let held = 0;

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const elapsed = now - last;
      last = now;

      const point = pointRef.current;
      if (!point) return;

      const proximity = edgeProximity(point, width, height);
      if (!isNearEdge(proximity)) {
        held = 0;
        return;
      }

      held += elapsed;
      const push = edgeScrollPush(proximity, width, height, held, elapsed);
      if (push.dx === 0 && push.dy === 0) return;

      onScrollRef.current(push.dx, push.dy);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, width, height, pointRef]);
}
