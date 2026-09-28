import { describe, expect, it } from 'vitest';
import type { DeletionPreview } from './account-deletion-api';
import { confirmsAddress, deletionStep, readyToDelete, resumeApplies } from './account-deletion';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const EMAIL = 'pat@example.com';

const preview = (overrides: Partial<DeletionPreview> = {}): DeletionPreview => ({
  email: EMAIL,
  identityCheck: 'password',
  recentSignInUntil: null,
  graceDays: 7,
  ownedBoards: 2,
  sharedBoards: [],
  sharedWorkspaces: [],
  ...overrides,
});

describe('confirmsAddress', () => {
  it('accepts the address, forgiving case and surrounding space as the gateway does', () => {
    expect(confirmsAddress('pat@example.com', EMAIL)).toBe(true);
    expect(confirmsAddress('  Pat@Example.COM ', EMAIL)).toBe(true);
  });

  it('refuses anything else, and an empty answer', () => {
    expect(confirmsAddress('pat@example.co', EMAIL)).toBe(false);
    expect(confirmsAddress('DELETE', EMAIL)).toBe(false);
    expect(confirmsAddress('   ', '')).toBe(false);
  });
});

describe('deletionStep', () => {
  it('asks an account with a password for it', () => {
    expect(deletionStep(preview(), NOW)).toBe('password');
  });

  it('lets a provider-only account through while its sign-in is recent', () => {
    const recent = preview({
      identityCheck: 'recent-sign-in',
      recentSignInUntil: new Date(NOW + 60_000).toISOString(),
    });
    expect(deletionStep(recent, NOW)).toBe('recent');
  });

  it('sends a provider-only account to sign in again once that has passed', () => {
    const lapsed = preview({
      identityCheck: 'recent-sign-in',
      recentSignInUntil: new Date(NOW - 1).toISOString(),
    });
    expect(deletionStep(lapsed, NOW)).toBe('sign-in-again');
    expect(deletionStep(preview({ identityCheck: 'recent-sign-in' }), NOW)).toBe('sign-in-again');
  });

  it('stops at a workspace other people belong to, whatever else is true', () => {
    expect(deletionStep(preview({ sharedWorkspaces: [{ id: 'w', name: 'Team' }] }), NOW)).toBe(
      'blocked',
    );
  });
});

describe('readyToDelete', () => {
  const base = {
    step: 'password' as const,
    typed: EMAIL,
    email: EMAIL,
    password: 'x',
    busy: false,
  };

  it('needs the address typed and, for a password account, the password', () => {
    expect(readyToDelete(base)).toBe(true);
    expect(readyToDelete({ ...base, password: '' })).toBe(false);
    expect(readyToDelete({ ...base, typed: 'pat' })).toBe(false);
  });

  it('needs no password once a recent sign-in has answered for it', () => {
    expect(readyToDelete({ ...base, step: 'recent', password: '' })).toBe(true);
  });

  it('never while busy, blocked or waiting on a fresh sign-in', () => {
    expect(readyToDelete({ ...base, busy: true })).toBe(false);
    expect(readyToDelete({ ...base, step: 'blocked' })).toBe(false);
    expect(readyToDelete({ ...base, step: 'sign-in-again' })).toBe(false);
  });
});

describe('resumeApplies', () => {
  const note = (userId: string, at: number) => JSON.stringify({ userId, at });

  it('reopens for the same account, straight back from signing in', () => {
    expect(resumeApplies(note('u1', NOW - 60_000), 'u1', NOW)).toBe(true);
  });

  it('does not reopen for somebody else who signed in instead', () => {
    expect(resumeApplies(note('u1', NOW - 60_000), 'u2', NOW)).toBe(false);
  });

  it('does not reopen once the new sign-in would no longer count as recent', () => {
    expect(resumeApplies(note('u1', NOW - 10 * 60_000), 'u1', NOW)).toBe(false);
  });

  it('ignores a note from the future, a broken one, or none', () => {
    expect(resumeApplies(note('u1', NOW + 60_000), 'u1', NOW)).toBe(false);
    expect(resumeApplies('{not json', 'u1', NOW)).toBe(false);
    expect(resumeApplies(null, 'u1', NOW)).toBe(false);
  });
});
