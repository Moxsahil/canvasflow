import { describe, expect, it } from 'vitest';
import {
  RECENT_SIGN_IN_MS,
  confirmsAddress,
  identityCheckFor,
  recentSignInUntil,
} from './deletion-checks.js';

describe('identityCheckFor', () => {
  it('asks for the password of an account that has one', () => {
    expect(identityCheckFor({ passwordHash: '$2b$12$hash' })).toBe('password');
  });

  it('asks a provider-only account to have signed in recently', () => {
    expect(identityCheckFor({ passwordHash: null })).toBe('recent-sign-in');
  });
});

describe('recentSignInUntil', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('counts a sign-in from a minute ago, until ten minutes after it', () => {
    expect(recentSignInUntil(ago(60_000), now)).toEqual(
      new Date(now.getTime() - 60_000 + RECENT_SIGN_IN_MS),
    );
  });

  it('stops counting the moment the window closes', () => {
    expect(recentSignInUntil(ago(RECENT_SIGN_IN_MS), now)).toBeNull();
    expect(recentSignInUntil(ago(RECENT_SIGN_IN_MS - 1), now)).not.toBeNull();
  });

  it('does not count a sign-in from yesterday', () => {
    expect(recentSignInUntil(ago(24 * 60 * 60 * 1000), now)).toBeNull();
  });

  it('counts a sign-in the database dates slightly ahead of this clock', () => {
    expect(recentSignInUntil(new Date(now.getTime() + 2_000), now)).not.toBeNull();
  });

  it('refuses when there is no sign-in to go by', () => {
    expect(recentSignInUntil(null, now)).toBeNull();
  });
});

describe('confirmsAddress', () => {
  const email = 'pat@example.com';

  it('accepts the address, whatever its case or surrounding space', () => {
    expect(confirmsAddress('pat@example.com', email)).toBe(true);
    expect(confirmsAddress('  Pat@Example.COM ', email)).toBe(true);
  });

  it('refuses anything else', () => {
    expect(confirmsAddress('pat@example.co', email)).toBe(false);
    expect(confirmsAddress('pat', email)).toBe(false);
    expect(confirmsAddress('DELETE', email)).toBe(false);
  });

  it('refuses an empty answer, even against an empty address', () => {
    expect(confirmsAddress('', email)).toBe(false);
    expect(confirmsAddress('   ', '')).toBe(false);
  });
});
