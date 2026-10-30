import { useCallback, useState } from 'react';

function storageKey(boardId: string): string {
  return `cf.shareLive.${boardId}`;
}

/**
 * Whether this board has a live share session, for the Share button.
 *
 * The server's answer takes a moment after a load, so the last answer is kept
 * in this browser and painted straight away: the button is the right colour on
 * the first frame, and the read that follows corrects it if the session ended.
 */
export function useShareLive(boardId: string): [boolean, (live: boolean) => void] {
  const [live, setLive] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey(boardId)) === '1';
    } catch {
      return false;
    }
  });

  const update = useCallback(
    (next: boolean) => {
      setLive(next);
      try {
        if (next) window.localStorage.setItem(storageKey(boardId), '1');
        else window.localStorage.removeItem(storageKey(boardId));
      } catch {
        // Private browsing can refuse storage; the read on load still answers.
      }
    },
    [boardId],
  );

  return [live, update];
}
