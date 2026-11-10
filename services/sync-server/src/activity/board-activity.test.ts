import { describe, expect, it, vi } from 'vitest';
import { captureLogger, seed, sql, testDb } from '../testing/harness.js';
import { BoardActivityCounter, startActivityFlush } from './board-activity.js';

describe('board activity', () => {
  it('adds up changes per board and person, and starts again after take()', () => {
    const counter = new BoardActivityCounter();
    counter.note('b1', 'u1');
    counter.note('b1', 'u1', 4);
    counter.note('b1', 'u2');
    expect(counter.take()).toEqual([
      { boardId: 'b1', userId: 'u1', changes: 5 },
      { boardId: 'b1', userId: 'u2', changes: 1 },
    ]);
    expect(counter.take()).toEqual([]);
  });

  it('writes what is left on stop, and keeps counts whose write failed', async () => {
    const s = await seed();
    const counter = new BoardActivityCounter();
    const log = captureLogger();
    const stop = startActivityFlush({ db: testDb(), log, counter });
    counter.note(s.boardId, s.owner.userId, 3);
    await stop();
    const rows = await sql<{ changes: number }>(
      `select changes from board_activity where board_id = $1 and user_id = $2`,
      [s.boardId, s.owner.userId],
    );
    expect(rows.map((r) => Number(r.changes))).toEqual([3]);

    const failing = {
      insert: vi.fn(() => {
        throw new Error('db down');
      }),
    } as never;
    const kept = new BoardActivityCounter();
    kept.note('b', 'u', 2);
    await startActivityFlush({ db: failing, log, counter: kept })();
    expect(log.entries.some((e) => e.msg.startsWith('could not record board activity'))).toBe(true);
    expect(kept.take()).toEqual([{ boardId: 'b', userId: 'u', changes: 2 }]);
  });
});
