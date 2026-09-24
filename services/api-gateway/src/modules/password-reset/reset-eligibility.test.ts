import { describe, expect, it } from 'vitest';
import { classifyResetToken, resetActionFor, type ResetCandidate } from './reset-eligibility.js';

const base: ResetCandidate = {
  isGuest: false,
  disabledAt: null,
  passwordHash: '$2b$12$hash',
  providers: [],
};

describe('resetActionFor', () => {
  it('sends a link to an account with a password', () => {
    expect(resetActionFor(base)).toBe('reset-link');
  });

  it('sends a link to a password account that also signs in with a provider', () => {
    expect(resetActionFor({ ...base, providers: ['google'] })).toBe('reset-link');
  });

  it('sends a notice, not a link, to a provider-only account', () => {
    expect(resetActionFor({ ...base, passwordHash: null, providers: ['github'] })).toBe(
      'provider-notice',
    );
  });

  it('sends nothing to a guest, whose address is synthetic', () => {
    expect(resetActionFor({ ...base, isGuest: true })).toBe('skip');
  });

  it('sends nothing to a barred account, even one with a password', () => {
    expect(resetActionFor({ ...base, disabledAt: new Date() })).toBe('skip');
  });

  it('sends nothing to an account with no way in at all', () => {
    expect(resetActionFor({ ...base, passwordHash: null })).toBe('skip');
  });
});

describe('classifyResetToken', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const fresh = {
    createdAt: new Date('2026-09-24T11:50:00Z'),
    expiresAt: new Date('2026-09-24T12:20:00Z'),
    usedAt: null,
  };
  const account = { isGuest: false, disabledAt: null, passwordChangedAt: null };

  it('accepts an unspent link inside its window', () => {
    expect(classifyResetToken(fresh, account, now)).toBe('valid');
  });

  it('reports a link past its expiry as expired', () => {
    expect(classifyResetToken({ ...fresh, expiresAt: now }, account, now)).toBe('expired');
  });

  it('reports a spent link as invalid, even once it has also expired', () => {
    const spentAndOld = { ...fresh, usedAt: fresh.createdAt, expiresAt: fresh.createdAt };
    expect(classifyResetToken(spentAndOld, account, now)).toBe('invalid');
  });

  it('refuses a link issued before the password last changed', () => {
    const changedAfter = { ...account, passwordChangedAt: new Date('2026-09-24T11:55:00Z') };
    expect(classifyResetToken(fresh, changedAfter, now)).toBe('invalid');
  });

  it('accepts a link issued after the password last changed', () => {
    const changedBefore = { ...account, passwordChangedAt: new Date('2026-09-24T11:00:00Z') };
    expect(classifyResetToken(fresh, changedBefore, now)).toBe('valid');
  });

  it('refuses a link for an account barred since it was sent', () => {
    expect(classifyResetToken(fresh, { ...account, disabledAt: now }, now)).toBe('invalid');
  });

  it('refuses a link for a guest', () => {
    expect(classifyResetToken(fresh, { ...account, isGuest: true }, now)).toBe('invalid');
  });
});
