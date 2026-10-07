import type { BoardSummary } from './workspace-api';

/**
 * A fresh board list folded into the one on screen without moving anything.
 *
 * The server orders boards by when they last changed, so a straight swap
 * would lift a board somebody just renamed to the top of the list — under the
 * pointer of whoever is reading it. Instead, boards already shown keep their
 * places and take the new details, new boards arrive at the top in the
 * server's order, and boards that are gone are dropped. Opening the workspace
 * again starts from the server's order.
 */
export function mergeBoards(shown: readonly BoardSummary[], fresh: readonly BoardSummary[]) {
  const byId = new Map(fresh.map((board) => [board.id, board]));
  const shownIds = new Set(shown.map((board) => board.id));

  const added = fresh.filter((board) => !shownIds.has(board.id));
  const kept = shown.flatMap((board) => {
    const latest = byId.get(board.id);
    return latest ? [latest] : [];
  });
  return [...added, ...kept];
}
