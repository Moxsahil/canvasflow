import { describe, expect, it } from 'vitest';
import { isInvitableRole, parseInviteEmail, rejectionOf } from './workspace-invites.js';

describe('parseInviteEmail', () => {
  it('trims and lower-cases, so one address is one invitation', () => {
    expect(parseInviteEmail('  Sam@Example.COM ')).toEqual({ ok: true, email: 'sam@example.com' });
  });

  it('refuses something that is not an address', () => {
    for (const raw of [
      '',
      '   ',
      'sam',
      'sam@',
      '@example.com',
      'sam@example',
      'a b@c.d',
      42,
      null,
    ]) {
      expect(parseInviteEmail(raw).ok).toBe(false);
    }
  });

  it('refuses an address longer than mail can carry', () => {
    expect(parseInviteEmail(`${'a'.repeat(250)}@x.io`).ok).toBe(false);
  });
});

describe('isInvitableRole', () => {
  it('offers member and admin, never owner', () => {
    expect(isInvitableRole('member')).toBe(true);
    expect(isInvitableRole('admin')).toBe(true);
    expect(isInvitableRole('owner')).toBe(false);
    expect(isInvitableRole(undefined)).toBe(false);
  });
});

describe('rejectionOf', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const open = {
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date('2026-10-19T12:00:00Z'),
  };

  it('lets an open invitation through', () => {
    expect(rejectionOf(open, null, now)).toBeNull();
  });

  it('says an invitation past its week has expired, to the second', () => {
    expect(rejectionOf({ ...open, expiresAt: now }, null, now)).toBe('expired');
  });

  it('says a revoked one was revoked', () => {
    expect(rejectionOf({ ...open, revokedAt: now }, null, now)).toBe('revoked');
  });

  it('says the workspace went before saying the invitation was revoked', () => {
    expect(rejectionOf({ ...open, revokedAt: now }, now, now)).toBe('workspace-deleted');
  });

  it('says an accepted invitation was accepted, even once it would have expired', () => {
    expect(rejectionOf({ ...open, acceptedAt: now, expiresAt: new Date(0) }, null, now)).toBe(
      'accepted',
    );
  });
});
