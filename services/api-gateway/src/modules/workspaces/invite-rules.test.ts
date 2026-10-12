import { describe, expect, it } from 'vitest';
import { describeCreateRefusal } from './invite-rules.js';

describe('describeCreateRefusal', () => {
  it('points an address that is already invited at sending it again', () => {
    const refusal = describeCreateRefusal('already-invited', 'sam@example.com');
    expect(refusal).toMatchObject({ status: 409, code: 'already-invited' });
    expect(refusal.message).toContain('sam@example.com');
  });

  it('answers a workspace that went away as missing', () => {
    expect(describeCreateRefusal('workspace-gone', 'x@y.z').status).toBe(404);
  });

  it('says somebody already in it is already in it', () => {
    expect(describeCreateRefusal('already-member', 'sam@example.com').message).toBe(
      'sam@example.com is already in this workspace.',
    );
  });
});
