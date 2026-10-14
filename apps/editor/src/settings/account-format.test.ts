import { describe, expect, it } from 'vitest';
import {
  formatDay,
  formatRelative,
  formatStorageSize,
  passwordHint,
  sessionsHint,
  signInMethodsHint,
  storageHint,
} from './account-format';
import type { AccountSecurity } from './account-security-api';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const base: AccountSecurity = {
  email: 'ada@example.com',
  hasPassword: true,
  passwordChangedAt: null,
  signedUpAt: '2026-09-17T09:00:00Z',
  providers: [],
  sessions: [],
};

describe('formatRelative', () => {
  it.each([
    [10_000, 'just now'],
    [5 * 60_000, '5 minutes ago'],
    [2 * 60 * 60_000, '2 hours ago'],
    [26 * 60 * 60_000, 'yesterday'],
    [3 * 24 * 60 * 60_000, '3 days ago'],
    [15 * 24 * 60 * 60_000, '2 weeks ago'],
  ])('%i ms ago reads "%s"', (elapsed, expected) => {
    expect(formatRelative(ago(elapsed), NOW)).toBe(expected);
  });
});

describe('formatDay', () => {
  it('reads as a short date', () => {
    expect(formatDay('2026-09-24T12:00:00Z')).toBe('24 Sep 2026');
  });
});

describe('passwordHint', () => {
  it('says when the password last changed', () => {
    expect(passwordHint({ ...base, passwordChangedAt: ago(3 * 24 * 60 * 60_000) }, NOW)).toBe(
      'Last changed 3 days ago',
    );
  });

  it('says a password set at signup has not changed since', () => {
    expect(passwordHint(base, NOW)).toBe('Unchanged since you signed up on 17 Sep 2026');
  });

  it('says a provider-only account has none, and how it signs in', () => {
    expect(passwordHint({ ...base, hasPassword: false, providers: ['google'] }, NOW)).toBe(
      'Not set: you sign in with Google',
    );
  });
});

describe('signInMethodsHint', () => {
  it('lists every way in, password first', () => {
    expect(signInMethodsHint({ ...base, providers: ['google', 'github'] })).toBe(
      'Email and password · Google · GitHub',
    );
  });

  it('lists providers alone for an account with no password', () => {
    expect(signInMethodsHint({ ...base, hasPassword: false, providers: ['github'] })).toBe(
      'GitHub',
    );
  });
});

describe('sessionsHint', () => {
  it('counts devices', () => {
    expect(sessionsHint(1)).toBe('1 device signed in right now');
    expect(sessionsHint(3)).toBe('3 devices signed in right now');
  });
});

describe('formatStorageSize', () => {
  it('reads in KB below a megabyte, never rounding something down to nothing', () => {
    expect(formatStorageSize(0)).toBe('0 KB');
    expect(formatStorageSize(200)).toBe('1 KB');
    expect(formatStorageSize(740 * 1024)).toBe('740 KB');
  });

  it('keeps one decimal below 10 MB, whole megabytes above, then GB', () => {
    expect(formatStorageSize(3.24 * 1024 * 1024)).toBe('3.2 MB');
    expect(formatStorageSize(48.4 * 1024 * 1024)).toBe('48 MB');
    expect(formatStorageSize(1.4 * 1024 * 1024 * 1024)).toBe('1.4 GB');
  });
});

describe('storageHint', () => {
  it('names the boards, and the images only when there are some', () => {
    expect(storageHint({ boards: 0, images: 0 })).toBe('You don’t own any boards yet');
    expect(storageHint({ boards: 1, images: 0 })).toBe('Across 1 board you own');
    expect(storageHint({ boards: 5, images: 1 })).toBe('Across 5 boards you own · 1 image');
    expect(storageHint({ boards: 5, images: 12 })).toBe('Across 5 boards you own · 12 images');
  });
});
