import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_CANVAS_BACKGROUND } from '../properties/palette';

const storageKey = (boardId: string) => `cf:canvas-background:${boardId}`;

function read(boardId: string): string {
  try {
    return localStorage.getItem(storageKey(boardId)) ?? DEFAULT_CANVAS_BACKGROUND;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies) — the colour
    // is a preference, so falling back to the default is the whole recovery.
    return DEFAULT_CANVAS_BACKGROUND;
  }
}

/**
 * The board's canvas background colour, remembered per board in localStorage.
 *
 * It's a local viewing preference rather than document data: nothing in the Yjs
 * document describes board appearance yet, so collaborators each keep their own
 * background instead of one being pushed to everyone.
 */
export function useCanvasBackground(boardId: string) {
  const [color, setColor] = useState(() => read(boardId));

  // Editor isn't remounted when the route's board changes, so re-read on id.
  useEffect(() => {
    setColor(read(boardId));
  }, [boardId]);

  const setCanvasBackground = useCallback(
    (next: string) => {
      setColor(next);
      try {
        localStorage.setItem(storageKey(boardId), next);
      } catch {
        // Preference just won't survive a reload.
      }
    },
    [boardId],
  );

  return { canvasBackground: color, setCanvasBackground };
}
