import { describe, expect, it } from 'vitest';
import type { AccountDeletionRow } from '../schema/account-deletion.js';
import {
  parseRestoreArgs,
  restorePlan,
  timeLeft,
  type AccountDeletionLookup,
} from './account-restore.js';

const NOW = new Date('2026-09-28T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const USER = '3ef72266-0242-48aa-a2ad-741a5fd16bf7';
const OTHER = '318a4e6c-bf17-4ec4-a5bd-966fac7a8738';

function request(overrides: Partial<AccountDeletionRow> = {}): AccountDeletionRow {
  return {
    id: 'req-1',
    userId: USER,
    requestedAt: new Date(NOW.getTime() - 24 * HOUR),
    purgeAfter: new Date(NOW.getTime() + 6 * 24 * HOUR),
    status: 'scheduled',
    cancelledAt: null,
    completedAt: null,
    ...overrides,
  };
}

function account(overrides: Partial<AccountDeletionLookup> = {}): AccountDeletionLookup {
  return {
    userId: USER,
    name: 'Pat',
    email: 'pat@example.com',
    request: request(),
    hiddenBoards: 2,
    ...overrides,
  };
}

describe('restorePlan', () => {
  it('offers to restore the one account with a deletion waiting', () => {
    expect(restorePlan([account()], NOW)).toMatchObject({ kind: 'restorable' });
  });

  it('finds nobody for an address no account has, or one already erased', () => {
    expect(restorePlan([], NOW)).toEqual({ kind: 'no-account' });
  });

  it('says there is nothing to restore when no deletion is waiting', () => {
    for (const latest of [null, request({ status: 'cancelled' })]) {
      expect(restorePlan([account({ request: latest })], NOW)).toMatchObject({
        kind: 'nothing-pending',
      });
    }
  });

  it('refuses once the grace period is over, as the restore itself would', () => {
    const lapsed = account({ request: request({ purgeAfter: new Date(NOW.getTime() - 1) }) });
    expect(restorePlan([lapsed], NOW)).toMatchObject({ kind: 'too-late' });
    const exactly = account({ request: request({ purgeAfter: NOW }) });
    expect(restorePlan([exactly], NOW)).toMatchObject({ kind: 'too-late' });
  });

  it('picks the one that has a deletion waiting when two accounts share the address', () => {
    const idle = account({ userId: OTHER, request: null });
    expect(restorePlan([idle, account()], NOW)).toMatchObject({
      kind: 'restorable',
      account: { userId: USER },
    });
  });

  it('asks which, when two sharing the address both have one waiting', () => {
    const both = [account(), account({ userId: OTHER, request: request({ userId: OTHER }) })];
    expect(restorePlan(both, NOW)).toMatchObject({ kind: 'choose' });
    expect(restorePlan(both, NOW, OTHER)).toMatchObject({
      kind: 'restorable',
      account: { userId: OTHER },
    });
  });

  it('finds nobody when --user names an account the address does not belong to', () => {
    expect(restorePlan([account()], NOW, OTHER)).toEqual({ kind: 'no-account' });
  });
});

describe('timeLeft', () => {
  it('says days and hours, rounded down', () => {
    expect(timeLeft(6 * 24 * HOUR + 3 * HOUR + 59 * 60_000)).toBe('6 days 3 hours');
    expect(timeLeft(24 * HOUR)).toBe('1 day');
    expect(timeLeft(HOUR)).toBe('1 hour');
    expect(timeLeft(30 * 60_000)).toBe('0 hours');
  });
});

describe('parseRestoreArgs', () => {
  it('reads the address, and does nothing without --confirm', () => {
    expect(parseRestoreArgs(['pat@example.com'])).toEqual({
      email: 'pat@example.com',
      confirm: false,
    });
    expect(parseRestoreArgs(['--', ' pat@example.com ', '--confirm'])).toEqual({
      email: 'pat@example.com',
      confirm: true,
    });
  });

  it('takes an account id to choose between accounts', () => {
    expect(parseRestoreArgs(['pat@example.com', '--user', USER])).toEqual({
      email: 'pat@example.com',
      confirm: false,
      userId: USER,
    });
    expect(parseRestoreArgs(['pat@example.com', '--user', 'pat'])).toEqual({
      error: '--user needs an account id.',
    });
  });

  it('refuses anything it does not understand, rather than guessing', () => {
    expect(parseRestoreArgs([])).toHaveProperty('error');
    expect(parseRestoreArgs(['pat'])).toHaveProperty('error');
    expect(parseRestoreArgs(['pat@example.com', 'sam@example.com'])).toHaveProperty('error');
    expect(parseRestoreArgs(['pat@example.com', '--force'])).toHaveProperty('error');
  });
});
