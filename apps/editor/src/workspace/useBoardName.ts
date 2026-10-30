import { useEffect, useState } from 'react';

/** How long a board's name may keep the sidebar on its skeleton before giving up. */
const NAME_WAIT_MS = 5000;

/**
 * What to draw for the open board's name. The title is the board's id until an
 * answer names it, and that id is never for reading: 'pending' while one may
 * still come, 'unnamed' if none did.
 */
export function useBoardName(title: string, boardId: string): 'named' | 'pending' | 'unnamed' {
  const unnamed = title === boardId;
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!unnamed) return;
    const timer = window.setTimeout(() => setGaveUp(true), NAME_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [unnamed]);

  if (!unnamed) return 'named';
  return gaveUp ? 'unnamed' : 'pending';
}
