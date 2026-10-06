import { describe, expect, it } from 'vitest';
import { RECENT_KEPT, withRecentItem } from './library-storage';

describe('withRecentItem', () => {
  it('puts the item placed last first, once', () => {
    expect(withRecentItem(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(withRecentItem([], 'a')).toEqual(['a']);
  });

  it('keeps only so many', () => {
    const full = Array.from({ length: RECENT_KEPT }, (_, i) => `i${i}`);
    const next = withRecentItem(full, 'new');
    expect(next).toHaveLength(RECENT_KEPT);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`i${RECENT_KEPT - 1}`);
  });
});
