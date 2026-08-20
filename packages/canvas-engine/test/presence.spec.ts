import { describe, expect, it } from 'vitest';
import {
  PRESENCE_PALETTE,
  parsePresenceState,
  presenceColor,
  presenceColorFor,
  presenceInitial,
} from '../src/presence/index.js';

describe('presenceColor', () => {
  it('is stable for the same user id', () => {
    const id = '8f14e45f-ea3f-4c1e-9a2b-7d1c0b3e5a91';
    expect(presenceColor(id)).toBe(presenceColor(id));
  });

  it('always resolves to a palette entry', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(PRESENCE_PALETTE).toContain(presenceColor(`user-${i}`));
    }
  });

  it('spreads UUIDs across the whole palette', () => {
    // The point of hashing rather than assigning: ids that share a long prefix
    // (as UUIDs from one generator do) must not collapse onto one colour.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(presenceColor(`0189c4f2-9b3a-7c11-a0e2-${String(i).padStart(12, '0')}`).name);
    }
    expect(seen.size).toBe(PRESENCE_PALETTE.length);
  });

  it('gives a different value per theme', () => {
    const id = 'abc';
    expect(presenceColorFor(id, 'light')).not.toBe(presenceColorFor(id, 'dark'));
  });
});

describe('parsePresenceState', () => {
  const valid = {
    user: { id: 'u1', name: 'Sahil' },
    cursor: { x: 10, y: 20 },
    button: 'down',
    selectedIds: ['s1', 's2'],
    activity: 'idle',
    lastActiveAt: 1234,
  };

  it('accepts a well-formed record', () => {
    expect(parsePresenceState(valid)).toEqual(valid);
  });

  it.each([null, undefined, 42, 'nope', {}, { user: {} }, { user: { id: '' } }])(
    'rejects %p',
    (raw) => {
      expect(parsePresenceState(raw)).toBeNull();
    },
  );

  it('drops a cursor with non-finite coordinates', () => {
    // A NaN would propagate into canvas draw calls and silently blank the layer.
    expect(parsePresenceState({ ...valid, cursor: { x: NaN, y: 1 } })?.cursor).toBeNull();
  });

  it('falls back to safe defaults for malformed fields', () => {
    const parsed = parsePresenceState({
      user: { id: 'u1', name: 42 },
      button: 'sideways',
      selectedIds: 'not-an-array',
      activity: 'partying',
      lastActiveAt: 'soon',
    });

    expect(parsed).toEqual({
      user: { id: 'u1', name: '' },
      cursor: null,
      button: 'up',
      selectedIds: [],
      activity: 'active',
      lastActiveAt: 0,
    });
  });

  it('keeps only the string entries of selectedIds', () => {
    expect(parsePresenceState({ ...valid, selectedIds: ['a', 7, null, 'b'] })?.selectedIds).toEqual(
      ['a', 'b'],
    );
  });

  it('caps the name length', () => {
    const parsed = parsePresenceState({ ...valid, user: { id: 'u1', name: 'x'.repeat(500) } });
    expect(parsed?.user.name).toHaveLength(64);
  });
});

describe('presenceInitial', () => {
  it('capitalizes the first letter', () => {
    expect(presenceInitial('sahil')).toBe('S');
  });

  it('keeps an emoji whole', () => {
    // [0] would slice through the surrogate pair and render a replacement char.
    expect(presenceInitial('🎨 Studio')).toBe('🎨');
  });

  it('falls back for an empty name', () => {
    expect(presenceInitial('   ')).toBe('?');
  });
});
