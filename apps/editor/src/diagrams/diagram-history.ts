/**
 * The diagrams drawn on a board, kept in this browser so the panel still has
 * them after it closes or the page reloads.
 *
 * Only here: the gateway keeps no description and no diagram, and this list
 * is the person's own, on their own device. Ten per board, newest last, which
 * is the order the panel shows them in.
 */

export interface DiagramEntry {
  id: string;
  /** What was asked: the description, or for a change, the change. */
  description: string;
  /** The diagram's lines, exactly as they streamed in. */
  lines: string[];
  createdAt: number;
  /** The entry this one changed, when it was a change. */
  changeOf?: string;
  /** How long it took to draw, in ms. */
  took?: number;
  /** Lines the fix-up pass corrected, when there was one. */
  fixed?: number;
}

export const HISTORY_LIMIT = 10;

const keyFor = (boardId: string) => `cf.diagrams.${boardId}`;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is DiagramEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.description === 'string' &&
    typeof entry.createdAt === 'number' &&
    Array.isArray(entry.lines) &&
    entry.lines.every((line) => typeof line === 'string') &&
    (entry.changeOf === undefined || typeof entry.changeOf === 'string') &&
    (entry.took === undefined || typeof entry.took === 'number') &&
    (entry.fixed === undefined || typeof entry.fixed === 'number')
  );
}

export function readHistory(boardId: string, store: Storage | null = storage()): DiagramEntry[] {
  try {
    const raw = store?.getItem(keyFor(boardId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(-HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeHistory(
  boardId: string,
  entries: readonly DiagramEntry[],
  store: Storage | null = storage(),
): void {
  try {
    store?.setItem(keyFor(boardId), JSON.stringify(entries.slice(-HISTORY_LIMIT)));
  } catch {
    // Full or blocked storage costs the list after a reload, nothing more.
  }
}

/** The list with one more at the end, the oldest dropped past the limit. */
export function withEntry(entries: readonly DiagramEntry[], entry: DiagramEntry): DiagramEntry[] {
  return [...entries, entry].slice(-HISTORY_LIMIT);
}
