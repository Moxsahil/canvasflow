import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { INTERNAL_PURPOSE, isInternalCaller } from '../../common/internal-caller.js';
import { parseNotifyEvent } from './internal-notify.controller.js';

const SECRET = 'a-test-secret-that-is-long-enough-to-pass';
const A = '6f1c2a7e-1b2c-4d3e-8f90-123456789abc';
const B = '00000000-0000-4000-8000-000000000000';

describe('isInternalCaller', () => {
  const credential = createHmac('sha256', SECRET).update(INTERNAL_PURPOSE.notify).digest('hex');

  it('takes the credential for its own purpose', () => {
    expect(isInternalCaller(credential, SECRET, INTERNAL_PURPOSE.notify)).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isInternalCaller(credential, SECRET, 'canvasflow:internal:board-access:v1')).toBe(false);
    expect(isInternalCaller(credential, `${SECRET}x`, INTERNAL_PURPOSE.notify)).toBe(false);
    for (const wrong of [undefined, '', 'nope', credential.slice(1), 7]) {
      expect(isInternalCaller(wrong, SECRET, INTERNAL_PURPOSE.notify)).toBe(false);
    }
  });
});

describe('parseNotifyEvent', () => {
  it('reads each event it knows', () => {
    expect(parseNotifyEvent({ event: 'board-joined', boardId: A, userId: B })).toEqual({
      event: 'board-joined',
      boardId: A,
      userId: B,
    });
    expect(parseNotifyEvent({ event: 'workspace-joined', inviteId: A })).toEqual({
      event: 'workspace-joined',
      inviteId: A,
    });
    expect(
      parseNotifyEvent({
        event: 'board-access-changed',
        boardId: A,
        userId: B,
        actorId: A,
        change: 'restored',
      }),
    ).toEqual({
      event: 'board-access-changed',
      boardId: A,
      userId: B,
      actorId: A,
      change: 'restored',
    });
  });

  it('refuses one it does not, or one missing what it needs', () => {
    expect(parseNotifyEvent(null)).toBeNull();
    expect(parseNotifyEvent({ event: 'made-up', boardId: A })).toBeNull();
    expect(parseNotifyEvent({ event: 'board-joined', boardId: A })).toBeNull();
    expect(parseNotifyEvent({ event: 'board-joined', boardId: 'x', userId: B })).toBeNull();
    expect(
      parseNotifyEvent({
        event: 'board-access-changed',
        boardId: A,
        userId: B,
        actorId: A,
        change: 'removed',
      }),
    ).toBeNull();
  });
});
