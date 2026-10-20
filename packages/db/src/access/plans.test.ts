import { describe, expect, it } from 'vitest';
import { parseSetPlanArgs } from './plans.js';

const WORKSPACE = '3ef72266-0242-48aa-a2ad-741a5fd16bf7';

describe('parseSetPlanArgs', () => {
  it('reads a target and a plan, changing nothing without --confirm', () => {
    expect(parseSetPlanArgs(['pat@example.com', 'team'])).toEqual({
      target: 'pat@example.com',
      plan: 'team',
      confirm: false,
    });
  });

  it('reads --confirm, --workspace and --note in any order', () => {
    expect(
      parseSetPlanArgs([
        '--',
        '--note',
        'UPI 20 Oct',
        'pat@example.com',
        '--confirm',
        'pro',
        '--workspace',
        WORKSPACE,
      ]),
    ).toEqual({
      target: 'pat@example.com',
      plan: 'pro',
      confirm: true,
      workspaceId: WORKSPACE,
      note: 'UPI 20 Oct',
    });
  });

  it('names the plans it knows when given one it does not', () => {
    const result = parseSetPlanArgs(['my-team', 'gold']);
    expect('error' in result && result.error).toContain('gold');
    expect('error' in result && result.error).toContain('team');
  });

  it('wants exactly a target and a plan', () => {
    expect('error' in parseSetPlanArgs(['pat@example.com'])).toBe(true);
    expect('error' in parseSetPlanArgs(['a', 'team', 'extra'])).toBe(true);
  });

  it('refuses an unknown option, a --workspace that is not an id, and an empty --note', () => {
    expect('error' in parseSetPlanArgs(['a', 'team', '--force'])).toBe(true);
    expect('error' in parseSetPlanArgs(['a', 'team', '--workspace', 'my-team'])).toBe(true);
    expect('error' in parseSetPlanArgs(['a', 'team', '--note', '  '])).toBe(true);
  });
});
