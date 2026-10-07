import { describe, expect, it } from 'vitest';
import { parseUsername } from './users.js';

describe('parseUsername', () => {
  it('keeps a name as stored: lower case, without the @ or space around it', () => {
    expect(parseUsername('  @Ada_Lovelace ')).toEqual({ ok: true, username: 'ada_lovelace' });
    expect(parseUsername('ada.l')).toEqual({ ok: true, username: 'ada.l' });
  });

  it('refuses anything that is not a name', () => {
    expect(parseUsername(undefined).ok).toBe(false);
    expect(parseUsername(42).ok).toBe(false);
    expect(parseUsername('   ').ok).toBe(false);
    expect(parseUsername('@').ok).toBe(false);
  });

  it('holds a name to its length', () => {
    expect(parseUsername('ab')).toEqual({ ok: false, error: 'Use at least 3 characters.' });
    expect(parseUsername('a'.repeat(30)).ok).toBe(true);
    expect(parseUsername('a'.repeat(31))).toEqual({
      ok: false,
      error: 'Use 30 characters or fewer.',
    });
  });

  it('allows letters, numbers, underscores and periods, and nothing else', () => {
    for (const bad of ['ada lovelace', 'ada-l', 'ada!', 'zoë', 'ada​']) {
      expect(parseUsername(bad)).toEqual({
        ok: false,
        error: 'Use only letters, numbers, underscores and periods.',
      });
    }
  });

  it('wants a letter, and periods only inside and one at a time', () => {
    expect(parseUsername('12345')).toEqual({ ok: false, error: 'Include at least one letter.' });
    expect(parseUsername('.ada').ok).toBe(false);
    expect(parseUsername('ada.').ok).toBe(false);
    expect(parseUsername('ad..a')).toEqual({ ok: false, error: 'Use one period at a time.' });
    expect(parseUsername('_ada_').ok).toBe(true);
  });

  it('keeps the reserved names, and anything passing as the product', () => {
    for (const reserved of ['admin', 'Everyone', 'here', 'boards', 'canvasflow_team']) {
      expect(parseUsername(reserved)).toEqual({ ok: false, error: 'That username is reserved.' });
    }
  });
});
