import { describe, expect, it } from 'vitest';
import { USERNAME_CHECK_LIMIT } from '@canvasflow/types';
import { usernameCandidates, usernameStem } from './username-suggestions';

describe('usernameStem', () => {
  it('makes a name out of a display name', () => {
    expect(usernameStem('Ada Lovelace')).toBe('ada_lovelace');
    expect(usernameStem("Zoë  O'Brien")).toBe('zoe_o_brien');
    expect(usernameStem('  --Grace Hopper-- ')).toBe('grace_hopper');
  });

  it('keeps within the limit without ending on an underscore', () => {
    // The cut at 30 lands on the space before "Jr".
    expect(usernameStem('Maximilian Alexander Kowalski Jr')).toBe('maximilian_alexander_kowalski');
    expect(usernameStem('Alexandria Ocasio Cortez Ramirez')).toHaveLength(30);
  });

  it('gives nothing when there is nothing to make one from', () => {
    expect(usernameStem('李小龍')).toBeNull();
    expect(usernameStem('Al')).toBeNull();
    expect(usernameStem('2024')).toBeNull();
    expect(usernameStem('Admin')).toBeNull();
  });
});

describe('usernameCandidates', () => {
  const half = () => 0.5;

  it('offers the name itself first, then numbered, then one at random', () => {
    const offered = usernameCandidates({ name: 'Ada Lovelace', email: null }, half);
    expect(offered).toHaveLength(USERNAME_CHECK_LIMIT);
    expect(offered[0]).toBe('ada_lovelace');
    expect(offered.slice(1, 3)).toEqual(['ada_lovelace2', 'ada_lovelace3']);
    expect(offered.at(-1)).toBe('ada_lovelace550');
  });

  it('falls back to the address when the name will not do', () => {
    expect(usernameCandidates({ name: '李小龍', email: 'bruce.lee@example.com' }, half)[0]).toBe(
      'bruce_lee',
    );
    expect(usernameCandidates({ name: 'Al', email: null }, half)).toEqual([]);
  });

  it('leaves room for the number on a name at the limit', () => {
    for (const name of usernameCandidates({ name: 'x'.repeat(40), email: null }, half)) {
      expect(name.length).toBeLessThanOrEqual(30);
    }
  });
});
