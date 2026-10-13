import { recordBoardActivity, type ActivityCount, type Database } from '@canvasflow/db';
import type { Logger } from '../logging/logger.js';

/** How often the counts are added to the database. */
export const ACTIVITY_FLUSH_INTERVAL_MS = 60_000;

/**
 * Counting who changes which board, for the weekly digest.
 *
 * Every change this service accepts is counted in memory, against the person
 * whose connection sent it, and the counts are added to `board_activity`
 * about once a minute — one write however busy the boards are. A crash loses
 * at most a minute of counts, which costs the digest nothing it would notice:
 * it asks who changed a board this week, not how much.
 */
export class BoardActivityCounter {
  private counts = new Map<string, ActivityCount>();

  note(boardId: string, userId: string, changes = 1): void {
    const key = `${boardId}:${userId}`;
    const count = this.counts.get(key);
    if (count) count.changes += changes;
    else this.counts.set(key, { boardId, userId, changes });
  }

  /** Everything counted since the last time, which starts the count again. */
  take(): ActivityCount[] {
    const taken = [...this.counts.values()];
    this.counts = new Map();
    return taken;
  }
}

/**
 * Add the counts up on a timer. Answers a stop that adds what is left, for a
 * shutdown. A failed write keeps its counts for the next one.
 */
export function startActivityFlush(deps: {
  db: Database;
  log: Logger;
  counter: BoardActivityCounter;
}): () => Promise<void> {
  const flush = async () => {
    const counts = deps.counter.take();
    if (counts.length === 0) return;
    try {
      await recordBoardActivity(deps.db, counts);
    } catch (err) {
      for (const { boardId, userId, changes } of counts)
        deps.counter.note(boardId, userId, changes);
      deps.log.warn('could not record board activity; kept for the next try', {
        rows: counts.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
  const timer = setInterval(() => void flush(), ACTIVITY_FLUSH_INTERVAL_MS);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await flush();
  };
}
