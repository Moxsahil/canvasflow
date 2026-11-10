import { describe, expect, it, vi } from 'vitest';
import type { PresenceState } from '@canvasflow/canvas-engine';
import { PresenceChannel } from './PresenceChannel';

/**
 * Presence over the sync connection: what this browser tells the others, and
 * which of the records the others send are believed. Played against a stand-in
 * for the connection's awareness, which only holds states and says when they
 * change.
 */

class FakeAwareness {
  readonly clientID = 1;
  readonly states = new Map<number, unknown>();
  private readonly handlers = new Set<() => void>();
  local: Record<string, unknown> | null = {};

  on(_event: 'change', handler: () => void) {
    this.handlers.add(handler);
  }
  off(_event: 'change', handler: () => void) {
    this.handlers.delete(handler);
  }
  getStates() {
    return this.states;
  }
  setLocalStateField(key: string, value: unknown) {
    this.local = { ...this.local, [key]: value };
    this.states.set(this.clientID, this.local);
  }
  setLocalState(value: Record<string, unknown> | null) {
    this.local = value;
  }
  /** Another browser's record arriving. */
  receive(clientId: number, record: unknown) {
    this.states.set(clientId, record);
    for (const handler of this.handlers) handler();
  }
  get listening() {
    return this.handlers.size;
  }
}

const presence = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  presence: {
    user: { id, name: id.toUpperCase() },
    cursor: { x: 1, y: 2 },
    selection: [],
    activity: 'active',
    lastActive: 1_000,
    ...overrides,
  },
});

function channel() {
  const awareness = new FakeAwareness();
  const presenceChannel = new PresenceChannel(awareness as never);
  return { awareness, presenceChannel };
}

describe('peers', () => {
  it('are the other browsers, not this one', () => {
    const { awareness, presenceChannel } = channel();
    awareness.receive(1, presence('me'));
    awareness.receive(2, presence('ada'));
    expect(presenceChannel.getPeers().map((peer) => [peer.clientId, peer.user.id])).toEqual([
      [2, 'ada'],
    ]);
  });

  it('leave out records that do not hold up', () => {
    const { awareness, presenceChannel } = channel();
    awareness.receive(2, { presence: { user: { id: '' } } });
    awareness.receive(3, { presence: 'garbage' });
    awareness.receive(4, {});
    awareness.receive(5, undefined);
    awareness.receive(6, presence('ok'));
    expect(presenceChannel.getPeers().map((peer) => peer.user.id)).toEqual(['ok']);
  });

  it('are told to each listener on every change, until it unsubscribes', () => {
    const { awareness, presenceChannel } = channel();
    const listener = vi.fn();
    const unsubscribe = presenceChannel.subscribe(listener);
    awareness.receive(2, presence('ada'));
    expect(listener).toHaveBeenLastCalledWith([expect.objectContaining({ clientId: 2 })]);
    unsubscribe();
    awareness.receive(3, presence('bo'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('can be found by account, the most recently active tab first', () => {
    const { awareness, presenceChannel } = channel();
    awareness.receive(2, presence('ada', { lastActive: 10 }));
    awareness.receive(3, presence('ada', { lastActive: 30 }));
    awareness.receive(4, presence('bo', { following: 'ada' }));
    expect(presenceChannel.findByUser('ada')?.clientId).toBe(3);
    expect(presenceChannel.findByUser('nobody')).toBeNull();
    expect(presenceChannel.followersOf('ada').map((peer) => peer.user.id)).toEqual(['bo']);
  });
});

describe('this browser’s presence', () => {
  const mine: PresenceState = {
    user: { id: 'me', name: 'Me', color: null, avatar: null, username: null },
    cursor: null,
    selection: [],
    activity: 'active',
    lastActive: 1,
  } as unknown as PresenceState;

  it('is published under one key, and patched in place', () => {
    const { awareness, presenceChannel } = channel();
    presenceChannel.patch({ selection: ['s1'] });
    // Nothing to patch before anything was published.
    expect(awareness.local).toEqual({});

    presenceChannel.publish(mine);
    expect(awareness.local).toEqual({ presence: mine });
    presenceChannel.patch({ selection: ['s1'] });
    expect((awareness.local?.presence as PresenceState).selection).toEqual(['s1']);
    expect(presenceChannel.getLocal()?.selection).toEqual(['s1']);
  });

  it('is withdrawn on dispose, and nothing is sent or heard after', () => {
    const { awareness, presenceChannel } = channel();
    const listener = vi.fn();
    presenceChannel.subscribe(listener);
    presenceChannel.publish(mine);

    presenceChannel.dispose();
    expect(awareness.local).toBeNull();
    expect(awareness.listening).toBe(0);

    presenceChannel.publish(mine);
    expect(awareness.local).toBeNull();
    awareness.receive(2, presence('ada'));
    expect(listener).not.toHaveBeenCalled();
  });
});
