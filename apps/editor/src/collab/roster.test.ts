import { describe, expect, it } from 'vitest';
import type { Peer, PresenceState } from '@canvasflow/canvas-engine';
import { buildRoster, rosterEquals } from './roster';

function peer(overrides: Partial<Peer> & { clientId: number; id: string }): Peer {
  const { clientId, id, ...rest } = overrides;
  return {
    clientId,
    user: { id, name: id },
    cursor: null,
    button: 'up',
    selectedIds: [],
    activity: 'active',
    lastActiveAt: 0,
    ...rest,
  };
}

const local: PresenceState = {
  user: { id: 'me', name: 'Sahil' },
  cursor: null,
  button: 'up',
  selectedIds: [],
  activity: 'active',
  lastActiveAt: 0,
};

describe('buildRoster', () => {
  it('is empty when there is no connection and no peers', () => {
    expect(buildRoster([], null)).toEqual([]);
  });

  it('puts the local user first', () => {
    const roster = buildRoster([peer({ clientId: 2, id: 'other' })], local);
    expect(roster.map((entry) => entry.userId)).toEqual(['me', 'other']);
    expect(roster[0]!.isLocal).toBe(true);
    expect(roster[1]!.isLocal).toBe(false);
  });

  it('collapses two tabs of the same person into one row', () => {
    // Awareness is keyed by connection, so this is what two tabs actually look
    // like on the wire.
    const roster = buildRoster(
      [peer({ clientId: 2, id: 'priya' }), peer({ clientId: 3, id: 'priya' })],
      local,
    );
    expect(roster).toHaveLength(2);
    expect(roster.filter((entry) => entry.userId === 'priya')).toHaveLength(1);
  });

  it('keeps the liveliest state when merging tabs', () => {
    const roster = buildRoster(
      [
        peer({ clientId: 2, id: 'priya', activity: 'idle' }),
        peer({ clientId: 3, id: 'priya', activity: 'active' }),
      ],
      local,
    );
    expect(roster.find((entry) => entry.userId === 'priya')?.activity).toBe('active');
  });

  it('does not upgrade an active tab to away', () => {
    const roster = buildRoster(
      [
        peer({ clientId: 2, id: 'priya', activity: 'active' }),
        peer({ clientId: 3, id: 'priya', activity: 'away' }),
      ],
      local,
    );
    expect(roster.find((entry) => entry.userId === 'priya')?.activity).toBe('active');
  });

  it('does not duplicate the local user when their own second tab is a peer', () => {
    const roster = buildRoster([peer({ clientId: 2, id: 'me' })], local);
    expect(roster).toHaveLength(1);
    expect(roster[0]!.isLocal).toBe(true);
  });

  it('carries each peer’s own name', () => {
    const roster = buildRoster(
      [{ ...peer({ clientId: 2, id: 'u2' }), user: { id: 'u2', name: 'Priya' } }],
      null,
    );
    expect(roster[0]!.name).toBe('Priya');
  });
});

describe('rosterEquals', () => {
  const a = buildRoster([peer({ clientId: 2, id: 'priya' })], local);

  it('treats an identical roster as unchanged', () => {
    // The guard that keeps remote cursor movement from re-rendering React:
    // a peer moving their mouse produces a new object with the same roster.
    const b = buildRoster([peer({ clientId: 2, id: 'priya', cursor: { x: 9, y: 9 } })], local);
    expect(rosterEquals(a, b)).toBe(true);
  });

  it('notices someone joining', () => {
    const b = buildRoster(
      [peer({ clientId: 2, id: 'priya' }), peer({ clientId: 3, id: 'sam' })],
      local,
    );
    expect(rosterEquals(a, b)).toBe(false);
  });

  it('notices someone leaving', () => {
    expect(rosterEquals(a, buildRoster([], local))).toBe(false);
  });

  it('notices an activity change', () => {
    const b = buildRoster([peer({ clientId: 2, id: 'priya', activity: 'idle' })], local);
    expect(rosterEquals(a, b)).toBe(false);
  });

  it('notices a rename', () => {
    const b = buildRoster(
      [{ ...peer({ clientId: 2, id: 'priya' }), user: { id: 'priya', name: 'Priya R' } }],
      local,
    );
    expect(rosterEquals(a, b)).toBe(false);
  });
});
