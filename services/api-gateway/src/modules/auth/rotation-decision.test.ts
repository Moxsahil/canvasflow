import { describe, expect, it } from 'vitest';
import {
  ABSOLUTE_SESSION_TTL_MS,
  REUSE_GRACE_MS,
  type SessionState,
  classifyRotation,
  resolveSpent,
} from './rotation-decision';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms);
const ahead = (ms: number) => new Date(NOW + ms);

function session(overrides: Partial<SessionState> = {}): SessionState {
  return {
    revokedAt: null,
    expiresAt: ahead(30 * 24 * 60 * 60 * 1000),
    createdAt: ago(60 * 60 * 1000),
    recoveredAt: null,
    ...overrides,
  };
}

describe('classifyRotation', () => {
  it('rotates an unspent token on a live session', () => {
    expect(classifyRotation(null, session(), NOW)).toBe('rotate');
  });

  it('forgives a token spent a moment ago — two tabs, not two people', () => {
    expect(classifyRotation(ago(REUSE_GRACE_MS - 1), session(), NOW)).toBe('raced');
  });

  it('treats a token spent longer ago as needing a closer look', () => {
    expect(classifyRotation(ago(REUSE_GRACE_MS + 1), session(), NOW)).toBe('spent');
  });

  describe('the session decides before the token', () => {
    // The regression this file exists for. Reading the token first meant a
    // revoked session answered "spent" and raised a theft alarm on every
    // retry, revoking itself again each time and burying any real one.
    it('answers invalid for a revoked session even holding a spent token', () => {
      const revoked = session({ revokedAt: ago(1000) });
      expect(classifyRotation(ago(REUSE_GRACE_MS + 1), revoked, NOW)).toBe('invalid');
    });

    it('answers invalid for an expired session even holding a spent token', () => {
      const expired = session({ expiresAt: ago(1) });
      expect(classifyRotation(ago(REUSE_GRACE_MS + 1), expired, NOW)).toBe('invalid');
    });

    it('answers invalid past the absolute cap even holding a spent token', () => {
      const old = session({ createdAt: ago(ABSOLUTE_SESSION_TTL_MS + 1) });
      expect(classifyRotation(ago(REUSE_GRACE_MS + 1), old, NOW)).toBe('invalid');
    });
  });

  it('refuses a session that expired exactly now', () => {
    expect(classifyRotation(null, session({ expiresAt: new Date(NOW) }), NOW)).toBe('invalid');
  });

  it('still rotates a session one millisecond inside the cap', () => {
    const almost = session({ createdAt: ago(ABSOLUTE_SESSION_TTL_MS - 1) });
    expect(classifyRotation(null, almost, NOW)).toBe('rotate');
  });
});

describe('resolveSpent', () => {
  it('calls it reuse when a later token was also spent — two parties, both progressing', () => {
    expect(resolveSpent(true, null)).toBe('reused');
  });

  it('rescues when nothing after it was ever used — the replacement never arrived', () => {
    expect(resolveSpent(false, null)).toBe('recover');
  });

  it('refuses a second rescue, which is what passing a session back and forth looks like', () => {
    expect(resolveSpent(false, ago(60_000))).toBe('reused');
  });

  it('calls it reuse when both are true', () => {
    expect(resolveSpent(true, ago(60_000))).toBe('reused');
  });
});
