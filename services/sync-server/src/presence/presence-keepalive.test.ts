import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Hocuspocus } from '@hocuspocus/server';
import { PRESENCE_RENEW_INTERVAL_MS, startPresenceKeepalive } from './presence-keepalive.js';

describe('presence keepalive', () => {
  afterEach(() => vi.useRealTimers());

  it('pings every open connection on every board each interval, until stopped', () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const connection = (name: string) => ({
      sendStateless: (m: string) => sent.push(`${name}:${m}`),
    });
    const server = {
      documents: new Map([
        ['b1', { getConnections: () => [connection('a'), connection('b')] }],
        ['b2', { getConnections: () => [connection('c')] }],
      ]),
    } as unknown as Hocuspocus;

    const stop = startPresenceKeepalive(server);
    vi.advanceTimersByTime(PRESENCE_RENEW_INTERVAL_MS);
    expect(sent).toEqual(['a', 'b', 'c'].map((n) => `${n}:{"type":"presence-renew"}`));
    stop();
    vi.advanceTimersByTime(PRESENCE_RENEW_INTERVAL_MS * 3);
    expect(sent).toHaveLength(3);
  });
});
