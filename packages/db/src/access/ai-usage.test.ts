import { describe, expect, it } from 'vitest';
import { nextUsageMonth, usageMonth } from './ai-usage.js';

describe('usageMonth', () => {
  it('names a month by its first day, in UTC', () => {
    expect(usageMonth(new Date('2026-10-21T09:30:00Z'))).toBe('2026-10-01');
    expect(usageMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });

  it('reads the last moment of a month as that month, wherever the server is', () => {
    expect(usageMonth(new Date('2026-10-31T23:59:59.999Z'))).toBe('2026-10-01');
    expect(usageMonth(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11-01');
  });
});

describe('nextUsageMonth', () => {
  it('is the first moment of the following month', () => {
    expect(nextUsageMonth(new Date('2026-10-21T09:30:00Z')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it('rolls over the year', () => {
    expect(nextUsageMonth(new Date('2026-12-31T23:00:00Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});
