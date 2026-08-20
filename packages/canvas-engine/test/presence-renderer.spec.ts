import { renderPresenceScene } from '../src/renderers/presence.js';
import { presenceColor } from '../src/presence/presence-color.js';
import { PEER_STALE_AFTER_MS, type Peer } from '../src/presence/presence-state.js';
import { makeTestRectangle } from './fixtures/shapes.js';

const NOW = 1_700_000_000_000;
const CAMERA = { x: 0, y: 0, zoom: 1 };

function createTestCanvas(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  return { canvas, ctx };
}

function makePeer(overrides: Partial<Peer> = {}): Peer {
  return {
    clientId: 1,
    user: { id: 'user-a', name: 'Priya' },
    cursor: { x: 100, y: 100 },
    button: 'up',
    selectedIds: [],
    activity: 'active',
    lastActiveAt: NOW,
    ...overrides,
  };
}

/** True if any pixel in the canvas has been painted. */
function hasInk(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > 0) return true;
  }
  return false;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Does the canvas contain a pixel close to this colour? */
function hasColor(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  hex: string,
): boolean {
  const [r, g, b] = hexToRgb(hex);
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 200) continue;
    // Antialiasing shifts edge pixels, so match on proximity rather than
    // equality — the arrow's interior is still a solid fill.
    if (
      Math.abs(data[i]! - r) <= 6 &&
      Math.abs(data[i + 1]! - g) <= 6 &&
      Math.abs(data[i + 2]! - b) <= 6
    ) {
      return true;
    }
  }
  return false;
}

function render(peers: readonly Peer[], opts: { theme?: 'light' | 'dark'; now?: number } = {}) {
  const width = 400;
  const height = 300;
  const { ctx } = createTestCanvas(width, height);
  renderPresenceScene(ctx, {
    width,
    height,
    camera: CAMERA,
    theme: opts.theme ?? 'light',
    peers,
    shapes: [makeTestRectangle({ id: 'rect-1', x: 40, y: 40 })],
    now: opts.now ?? NOW,
  });
  return { ctx, width, height };
}

describe('renderPresenceScene', () => {
  it('draws nothing when nobody else is on the board', () => {
    const { ctx, width, height } = render([]);
    expect(hasInk(ctx, width, height)).toBe(false);
  });

  it('draws a cursor in the peer’s own colour', () => {
    const { ctx, width, height } = render([makePeer()]);
    expect(hasColor(ctx, width, height, presenceColor('user-a').light)).toBe(true);
  });

  it('uses the theme variant, not the same colour in both themes', () => {
    const color = presenceColor('user-a');
    const light = render([makePeer()], { theme: 'light' });
    const dark = render([makePeer()], { theme: 'dark' });

    expect(hasColor(light.ctx, light.width, light.height, color.light)).toBe(true);
    expect(hasColor(dark.ctx, dark.width, dark.height, color.dark)).toBe(true);
    // The light variant must not leak into the dark render: the presence layer
    // sits outside the inversion filter, so nothing downstream corrects it.
    expect(hasColor(dark.ctx, dark.width, dark.height, color.light)).toBe(false);
  });

  it('hides a peer who has switched away from the tab', () => {
    const { ctx, width, height } = render([makePeer({ activity: 'away' })]);
    expect(hasInk(ctx, width, height)).toBe(false);
  });

  it('still draws an idle peer, dimmed', () => {
    const active = render([makePeer()]);
    const idle = render([makePeer({ activity: 'idle' })]);

    expect(hasInk(idle.ctx, idle.width, idle.height)).toBe(true);
    // Dimming is alpha, so the full-strength colour is gone from the idle draw.
    const color = presenceColor('user-a').light;
    expect(hasColor(active.ctx, active.width, active.height, color)).toBe(true);
    expect(hasColor(idle.ctx, idle.width, idle.height, color)).toBe(false);
  });

  it('drops a peer whose last update is older than the stale window', () => {
    const stale = render([makePeer()], { now: NOW + PEER_STALE_AFTER_MS + 1 });
    expect(hasInk(stale.ctx, stale.width, stale.height)).toBe(false);

    const fresh = render([makePeer()], { now: NOW + PEER_STALE_AFTER_MS - 1 });
    expect(hasInk(fresh.ctx, fresh.width, fresh.height)).toBe(true);
  });

  it('draws nothing for a peer whose pointer has left the canvas', () => {
    const { ctx, width, height } = render([makePeer({ cursor: null })]);
    expect(hasInk(ctx, width, height)).toBe(false);
  });

  it('clamps an off-screen cursor into the viewport instead of dropping it', () => {
    // Far outside a 400x300 viewport — it should still be drawn, at the edge.
    const { ctx, width, height } = render([makePeer({ cursor: { x: 9000, y: 9000 } })]);
    expect(hasInk(ctx, width, height)).toBe(true);
  });

  it('draws a selection outline for a shape the peer has selected', () => {
    const withSelection = render([makePeer({ cursor: null, selectedIds: ['rect-1'] })]);
    // Cursor is null, so any ink at all has to be the selection.
    expect(hasInk(withSelection.ctx, withSelection.width, withSelection.height)).toBe(true);
  });

  it('ignores a selected id that is not on the board', () => {
    const { ctx, width, height } = render([
      makePeer({ cursor: null, selectedIds: ['does-not-exist'] }),
    ]);
    expect(hasInk(ctx, width, height)).toBe(false);
  });

  it('survives a peer with no name', () => {
    expect(() => render([makePeer({ user: { id: 'user-a', name: '' } })])).not.toThrow();
  });

  it('follows the camera', () => {
    const width = 400;
    const height = 300;
    const { ctx } = createTestCanvas(width, height);

    // Panning the camera onto the cursor's neighbourhood should move it out of
    // view — proving the position is world space, not screen space.
    renderPresenceScene(ctx, {
      width,
      height,
      camera: { x: 5000, y: 5000, zoom: 1 },
      theme: 'light',
      peers: [makePeer()],
      shapes: [],
      now: NOW,
    });

    // Still drawn (clamped to the edge), but no longer at its unpanned spot.
    const { data } = ctx.getImageData(100, 100, 1, 1);
    expect(data[3]).toBe(0);
  });
});
