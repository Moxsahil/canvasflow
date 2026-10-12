import { describe, expect, it } from 'vitest';
import { describeMemberRefusal } from './member-rules.js';

describe('describeMemberRefusal', () => {
  it('tells an owner trying to leave to hand over first, with a code for the editor', () => {
    expect(describeMemberRefusal('leave', 'owner')).toMatchObject({
      status: 409,
      code: 'owner-must-hand-over',
    });
  });

  it('never lets anyone change or remove the owner', () => {
    expect(describeMemberRefusal('role', 'owner').status).toBe(403);
    expect(describeMemberRefusal('remove', 'owner').status).toBe(403);
  });

  it('points somebody removing themselves at leaving', () => {
    expect(describeMemberRefusal('remove', 'self').message).toBe(
      'To take yourself out, leave the workspace.',
    );
  });

  it('answers a missing workspace or person as missing', () => {
    expect(describeMemberRefusal('role', 'workspace-gone').status).toBe(404);
    expect(describeMemberRefusal('remove', 'not-member').status).toBe(404);
    expect(describeMemberRefusal('accept', 'no-offer').status).toBe(404);
  });

  it('says a guest who is no longer on any board is gone', () => {
    expect(describeMemberRefusal('guest', 'not-guest')).toMatchObject({ status: 404 });
    expect(describeMemberRefusal('guest', 'not-allowed').status).toBe(403);
  });
});
