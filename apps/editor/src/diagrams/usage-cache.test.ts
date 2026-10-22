import { describe, expect, it } from 'vitest';
import type { DiagramUsage } from '@canvasflow/types';
import {
  USAGE_FRESH_MS,
  bannerFor,
  closeBanner,
  closedBanner,
  isFresh,
  keepUsage,
  keptUsage,
} from './usage-cache';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const usage: DiagramUsage = {
  plan: 'pro',
  used: 17,
  limit: 100,
  resetsAt: '2026-11-01T00:00:00.000Z',
};

describe('kept diagram count', () => {
  it('is kept per person and board', () => {
    const store = memoryStorage();
    keepUsage('u1', 'b1', usage, 1000, store);
    expect(keptUsage('u1', 'b1', store)).toEqual({ usage, at: 1000 });
    expect(keptUsage('u2', 'b1', store)).toBeNull();
    expect(keptUsage('u1', 'b2', store)).toBeNull();
    expect(keptUsage(null, 'b1', store)).toBeNull();
  });

  it('stands without asking only while recent and in the same month', () => {
    const now = Date.parse('2026-10-21T12:00:00.000Z');
    expect(isFresh({ usage, at: now - 1000 }, now)).toBe(true);
    expect(isFresh({ usage, at: now - USAGE_FRESH_MS - 1 }, now)).toBe(false);
    expect(isFresh({ usage, at: now }, Date.parse('2026-11-01T00:00:01.000Z'))).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });

  it('reads nothing from what it did not write', () => {
    const store = memoryStorage();
    store.setItem('cf.diagrams.usage.u1.b1', 'nope');
    expect(keptUsage('u1', 'b1', store)).toBeNull();
    store.setItem('cf.diagrams.usage.u1.b1', JSON.stringify({ usage: { plan: 1 }, at: 1 }));
    expect(keptUsage('u1', 'b1', store)).toBeNull();
  });

  it('keeps the banner closed for the month and level it was closed at', () => {
    const store = memoryStorage();
    closeBanner('u1', bannerFor({ ...usage, used: 88 }), store);
    expect(closedBanner('u1', store)).toBe(bannerFor({ ...usage, used: 90 }));
    expect(closedBanner('u1', store)).not.toBe(bannerFor({ ...usage, used: 100 }));
    expect(closedBanner('u2', store)).toBeNull();
  });
});
