import { describe, expect, it } from 'vitest';
import { answerChecks, namesAsked, planChecks, TAKEN } from './username-checks.js';

describe('namesAsked', () => {
  it('takes one name or several', () => {
    expect(namesAsked('ada')).toEqual({ ok: true, names: ['ada'] });
    expect(namesAsked(['ada', 'ada2'])).toEqual({ ok: true, names: ['ada', 'ada2'] });
  });

  it('refuses nothing to check, too much, and anything not text', () => {
    expect(namesAsked(undefined).ok).toBe(false);
    expect(namesAsked([]).ok).toBe(false);
    expect(namesAsked({ 0: 'ada' }).ok).toBe(false);
    expect(namesAsked(['ada', 7]).ok).toBe(false);
    expect(namesAsked(Array.from({ length: 11 }, (_, i) => `ada${i}`))).toEqual({
      ok: false,
      error: 'Check 10 usernames or fewer at once.',
    });
  });
});

describe('planChecks', () => {
  it('looks up only the names that pass the rules, each once', () => {
    const { parsed, lookups } = planChecks(['Ada', 'ada', '@ADA', 'ab', 'admin', 'grace.h']);
    expect(lookups).toEqual(['ada', 'grace.h']);
    expect(parsed.map(({ result }) => result.ok)).toEqual([true, true, true, false, false, true]);
  });

  it('asks the database nothing when every name breaks a rule', () => {
    expect(planChecks(['ab', 'a b', 'everyone']).lookups).toEqual([]);
  });
});

describe('answerChecks', () => {
  const me = 'me';
  const holders = new Map([
    ['ada', 'someone-else'],
    ['grace.h', me],
  ]);

  it('answers in the order asked, as typed, with the stored form beside it', () => {
    const { parsed } = planChecks(['Ada', 'grace.h', 'linus', 'ab']);
    expect(answerChecks(parsed, holders, me)).toEqual([
      { name: 'Ada', username: 'ada', available: false, problem: TAKEN },
      // Their own name is theirs to keep.
      { name: 'grace.h', username: 'grace.h', available: true, problem: null },
      { name: 'linus', username: 'linus', available: true, problem: null },
      { name: 'ab', username: null, available: false, problem: 'Use at least 3 characters.' },
    ]);
  });

  it('keeps the Instagram rule: periods and underscores make a different name', () => {
    const { parsed } = planChecks(['ada', 'a.da', 'a_da']);
    expect(answerChecks(parsed, holders, me).map((check) => check.available)).toEqual([
      false,
      true,
      true,
    ]);
  });
});
