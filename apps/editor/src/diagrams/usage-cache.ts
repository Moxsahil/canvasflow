import type { DiagramUsage } from '@canvasflow/types';

/**
 * The month's diagram count as last read, kept in this browser so the panel
 * opens with it already in place rather than waiting on the gateway.
 *
 * Per person and board: the count is the person's, the plan that sets the
 * limit is the board's workspace's. Named by ids, never an email address.
 */

/** How long a count read from the gateway is trusted before it is asked again. */
export const USAGE_FRESH_MS = 5 * 60 * 1000;

interface Kept {
  usage: DiagramUsage;
  /** When the gateway said so, ms since the epoch. */
  at: number;
}

const keyFor = (userId: string, boardId: string) => `cf.diagrams.usage.${userId}.${boardId}`;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isUsage(value: unknown): value is DiagramUsage {
  if (typeof value !== 'object' || value === null) return false;
  const usage = value as Record<string, unknown>;
  return (
    typeof usage.plan === 'string' &&
    typeof usage.used === 'number' &&
    typeof usage.limit === 'number' &&
    typeof usage.resetsAt === 'string'
  );
}

export function keptUsage(
  userId: string | null,
  boardId: string,
  store: Storage | null = storage(),
): Kept | null {
  if (!userId) return null;
  try {
    const raw = store?.getItem(keyFor(userId, boardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { usage?: unknown; at?: unknown };
    return isUsage(parsed.usage) && typeof parsed.at === 'number'
      ? { usage: parsed.usage, at: parsed.at }
      : null;
  } catch {
    return null;
  }
}

export function keepUsage(
  userId: string | null,
  boardId: string,
  usage: DiagramUsage,
  at = Date.now(),
  store: Storage | null = storage(),
): void {
  if (!userId) return;
  try {
    store?.setItem(keyFor(userId, boardId), JSON.stringify({ usage, at }));
  } catch {
    // Not kept: the panel asks the gateway next time instead.
  }
}

/** Whether a kept count can stand without asking: recent, and from this month. */
export function isFresh(kept: Kept | null, now = Date.now()): boolean {
  return kept !== null && now - kept.at < USAGE_FRESH_MS && Date.parse(kept.usage.resetsAt) > now;
}
