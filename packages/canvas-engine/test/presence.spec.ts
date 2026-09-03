import { describe, expect, it } from 'vitest';
import {
  PRESENCE_PALETTE,
  isPeerFresh,
  parsePresenceState,
  presenceColor,
  presenceColorFor,
  presenceInitial,
  PEER_STALE_AFTER_MS,
  type Peer,
} from '../src/presence/index.js';
import { edgeHintFor, isCursorVisible, worldToScreen } from '../src/presence/cursor-visibility.js';

const CAMERA = { x: 0, y: 0, zoom: 1 };
const SCREEN = { width: 1000, height: 800 };

describe('parsePresenceState', () => {
  const valid = {
    user: { id: 'u1', name: 'Sahil' },
    cursor: { x: 10, y: 20 },
    selection: ['s1'],
    lasering: true,
    draft: null,
    camera: { x: 5, y: 6, zoom: 2 },
    screen: { width: 800, height: 600 },
    following: 'u2',
    activity: 'idle',
    lastActive: 1234,
  };

  it('accepts a well-formed record', () => {
    expect(parsePresenceState(valid)).toEqual(valid);
  });

  it.each([null, undefined, 7, 'nope', {}, { user: {} }, { user: { id: '' } }])(
    'rejects %p outright',
    (raw) => {
      expect(parsePresenceState(raw)).toBeNull();
    },
  );

  it('accepts a well-formed draft', () => {
    const draft = { kind: 'rectangle', x: 1, y: 2, width: 30, height: 40 };
    const parsed = parsePresenceState({ ...valid, draft });
    expect(parsed?.draft).toMatchObject({ kind: 'rectangle', x: 1, y: 2, width: 30, height: 40 });
  });

  it('drops a draft that is not a usable shape', () => {
    // Authored by another browser, so it can be anything at all. A NaN width
    // would reach the renderer's geometry rather than being rejected here.
    for (const draft of [7, 'rect', {}, { kind: 'rectangle' }, { kind: 'nope', x: 0, y: 0 }]) {
      expect(parsePresenceState({ ...valid, draft })?.draft).toBeNull();
    }
  });

  it('keeps a draft seed, so a peer’s shape does not reroll every frame', () => {
    // Rough.js derives its hand-drawn geometry from the seed. Regenerating it
    // on each parse would make an in-progress shape jitter, because a draft is
    // re-parsed on every awareness update while it is being drawn.
    const draft = { kind: 'ellipse', x: 0, y: 0, width: 10, height: 10, seed: 4242 };
    const first = parsePresenceState({ ...valid, draft })?.draft;
    const second = parsePresenceState({ ...valid, draft })?.draft;
    expect(first?.seed).toBe(4242);
    expect(second?.seed).toBe(4242);
  });

  it('drops a cursor with non-finite coordinates', () => {
    // A NaN would flow into transform maths and silently blank the layer.
    expect(parsePresenceState({ ...valid, cursor: { x: NaN, y: 1 } })?.cursor).toBeNull();
    expect(parsePresenceState({ ...valid, cursor: { x: Infinity, y: 1 } })?.cursor).toBeNull();
  });

  it('rejects a camera that would divide by zero', () => {
    expect(parsePresenceState({ ...valid, camera: { x: 0, y: 0, zoom: 0 } })?.camera).toBeNull();
    expect(parsePresenceState({ ...valid, camera: { x: 0, y: 0, zoom: -1 } })?.camera).toBeNull();
  });

  it('rejects a screen with no area', () => {
    expect(parsePresenceState({ ...valid, screen: { width: 0, height: 10 } })?.screen).toBeNull();
  });

  it('falls back to safe defaults for malformed fields', () => {
    expect(
      parsePresenceState({
        user: { id: 'u1', name: 42 },
        selection: 'not-an-array',
        activity: 'partying',
        following: 99,
        lastActive: 'soon',
      }),
    ).toEqual({
      user: { id: 'u1', name: '' },
      cursor: null,
      selection: [],
      lasering: false,
      draft: null,
      camera: null,
      screen: null,
      following: null,
      activity: 'active',
      lastActive: 0,
    });
  });

  it('reads anything but an explicit true as not lasering', () => {
    // A peer on an older build omits the field entirely, and reading that
    // absence as "not lasering" is the only safe interpretation.
    expect(parsePresenceState({ ...valid, lasering: undefined })?.lasering).toBe(false);
    expect(parsePresenceState({ ...valid, lasering: 'yes' })?.lasering).toBe(false);
    expect(parsePresenceState({ ...valid, lasering: 1 })?.lasering).toBe(false);
    expect(parsePresenceState({ ...valid, lasering: true })?.lasering).toBe(true);
  });

  it('keeps only the string entries of a selection', () => {
    expect(parsePresenceState({ ...valid, selection: ['a', 7, null, 'b'] })?.selection).toEqual([
      'a',
      'b',
    ]);
  });

  it('caps the name length', () => {
    const parsed = parsePresenceState({ ...valid, user: { id: 'u1', name: 'x'.repeat(500) } });
    expect(parsed?.user.name).toHaveLength(64);
  });
});

describe('isPeerFresh', () => {
  const peer = (lastActive: number) => ({ lastActive }) as Peer;

  it('keeps a peer that stamped recently', () => {
    expect(isPeerFresh(peer(1_000), 1_000 + PEER_STALE_AFTER_MS - 1)).toBe(true);
  });

  it('drops a peer whose stamp has gone stale', () => {
    expect(isPeerFresh(peer(1_000), 1_000 + PEER_STALE_AFTER_MS + 1)).toBe(false);
  });

  it('keeps a peer that never stamped', () => {
    // Trust the transport's own expiry rather than hiding them immediately.
    expect(isPeerFresh(peer(0), 9_999_999)).toBe(true);
  });
});

describe('presenceColor', () => {
  it('is stable for the same user', () => {
    expect(presenceColor('8f14e45f-ea3f-4c1e-9a2b-7d1c0b3e5a91')).toBe(
      presenceColor('8f14e45f-ea3f-4c1e-9a2b-7d1c0b3e5a91'),
    );
  });

  it('spreads UUIDs across the whole palette', () => {
    // The reason for hashing rather than assigning: ids sharing a long prefix,
    // as UUIDs from one generator do, must not collapse onto a single colour.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(presenceColor(`0189c4f2-9b3a-7c11-a0e2-${String(i).padStart(12, '0')}`).name);
    }
    expect(seen.size).toBe(PRESENCE_PALETTE.length);
  });

  it('gives a different value per theme', () => {
    expect(presenceColorFor('abc', 'light')).not.toBe(presenceColorFor('abc', 'dark'));
  });

  it('never returns the selection indigo', () => {
    // A collaborator wearing the same colour as your own selection outline is
    // the one collision that actively misleads.
    for (const entry of PRESENCE_PALETTE) {
      expect(entry.light.toLowerCase()).not.toBe('#6366f1');
      expect(entry.dark.toLowerCase()).not.toBe('#6366f1');
    }
  });
});

describe('cursor visibility', () => {
  it('converts world to screen through the camera', () => {
    expect(worldToScreen({ x: 100, y: 50 }, { x: 50, y: 0, zoom: 2 })).toEqual({ x: 100, y: 100 });
  });

  it('sees a cursor inside the viewport', () => {
    expect(isCursorVisible({ x: 500, y: 400 }, CAMERA, SCREEN)).toBe(true);
  });

  it('hides a cursor well outside the viewport', () => {
    expect(isCursorVisible({ x: 5000, y: 400 }, CAMERA, SCREEN)).toBe(false);
    expect(isCursorVisible({ x: -5000, y: 400 }, CAMERA, SCREEN)).toBe(false);
  });

  it('keeps a cursor just past the edge, so the glyph is not clipped away', () => {
    expect(isCursorVisible({ x: SCREEN.width + 4, y: 400 }, CAMERA, SCREEN)).toBe(true);
  });

  it('applies its margin in screen space, not world space', () => {
    // Zoomed far out, a 12px slack must not become a 1200-unit slack.
    const zoomedOut = { x: 0, y: 0, zoom: 0.01 };
    expect(isCursorVisible({ x: 500_000, y: 0 }, zoomedOut, SCREEN)).toBe(false);
  });

  it('clamps an off-screen peer onto the border', () => {
    const hint = edgeHintFor({ x: 9000, y: 400 }, CAMERA, SCREEN);
    expect(hint.x).toBeLessThanOrEqual(SCREEN.width);
    expect(hint.x).toBeGreaterThanOrEqual(0);
    expect(hint.y).toBeGreaterThanOrEqual(0);
  });

  it('points the hint toward where the peer actually is', () => {
    // Measured from the viewport centre: taking the angle from the clamped
    // point would flatten it to nearly horizontal and stop indicating anything.
    const right = edgeHintFor({ x: 9000, y: 400 }, CAMERA, SCREEN);
    expect(Math.abs(right.angle)).toBeLessThan(0.1); // ~0 rad, due east

    const left = edgeHintFor({ x: -9000, y: 400 }, CAMERA, SCREEN);
    expect(Math.abs(Math.abs(left.angle) - Math.PI)).toBeLessThan(0.1); // ~pi, due west
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
