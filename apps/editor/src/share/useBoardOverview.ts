import { useEffect, useState } from 'react';
import { env } from '@/lib/env';
import type { BoardColor } from '../workspace/workspace-api';
import type { BoardRole } from './share-api';

/** What anyone on a board may know about it. */
export interface BoardOverview {
  title: string;
  color: BoardColor;
  ownerId: string;
  ownerName: string;
  /** The caller's own role on the board. */
  role: BoardRole;
}

/**
 * The board's name, colour and owner, read from the gateway with the editor's
 * own token.
 *
 * For people outside the board's workspace — a collaborator or guest let in by
 * a share link — who have no board list to take a name from, and so saw the
 * board's id instead. The token is board-scoped and every one of them has it,
 * which is why this asks the gateway rather than the web app, where a guest
 * has no session.
 *
 * Read once per board when asked for; null until it arrives, and stays null if
 * it cannot be had — callers keep whatever they were showing.
 */
export function useBoardOverview(
  boardId: string,
  token: string | null,
  enabled: boolean,
): BoardOverview | null {
  const [overview, setOverview] = useState<{ boardId: string; value: BoardOverview } | null>(null);
  const ready = enabled && token !== null;
  const have = overview?.boardId === boardId;

  useEffect(() => {
    if (!ready || have || !token) return;
    const controller = new AbortController();
    fetch(new URL(`/boards/${boardId}/overview`, env.VITE_API_URL), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { data: BoardOverview };
        setOverview({ boardId, value: body.data });
      })
      .catch(() => {
        // Nothing to say: whoever asked keeps showing what it had.
      });
    return () => controller.abort();
    // The token is only the key to ask with; a fresh one is no reason to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, ready, have]);

  return have ? overview.value : null;
}
