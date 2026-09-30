import { useCallback, useRef, useState } from 'react';
import type { Shape } from '@canvasflow/canvas-engine';
import type { Point } from '../machine/tool-machine.types';
import type { PendingComment } from './CommentsLayer';
import { anchorAt } from './comment-model';

/**
 * What is open over the board: the thread being read, and the comment being
 * placed. At most one of the two — starting one puts the other away.
 *
 * Placing follows the press. The composer opens where the button goes down and
 * trails the pointer until it comes up, which is when the pin's place is
 * settled: on the shape under it, or on the board. The comment tool's three
 * pointer events map onto the three calls here.
 */
export function useCommentPlacement() {
  const [pending, setPending] = useState<PendingComment | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  // Whether a press is mid-placement, readable the instant it changes. A quick
  // click's release arrives before React has rendered the press, and a handler
  // asking the state above would be told no placement had begun.
  const placingRef = useRef(false);

  const begin = useCallback((point: Point) => {
    placingRef.current = true;
    setOpenThreadId(null);
    setPending({ anchor: anchorAt(point, null), point, placing: true });
  }, []);

  const follow = useCallback((point: Point) => {
    setPending((current) =>
      current?.placing ? { anchor: anchorAt(point, null), point, placing: true } : current,
    );
  }, []);

  const settle = useCallback((point: Point, target: Shape | null) => {
    placingRef.current = false;
    setPending((current) =>
      current?.placing ? { anchor: anchorAt(point, target), point, placing: false } : current,
    );
  }, []);

  const closePending = useCallback(() => {
    placingRef.current = false;
    setPending(null);
  }, []);

  const isPlacing = useCallback(() => placingRef.current, []);

  const openThread = useCallback((threadId: string | null) => {
    if (threadId) setPending(null);
    setOpenThreadId(threadId);
  }, []);

  return { pending, openThreadId, begin, follow, settle, isPlacing, closePending, openThread };
}
