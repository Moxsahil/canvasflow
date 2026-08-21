/** Whether a peer is at the keyboard. */
export type PresenceActivity = 'active' | 'idle' | 'away';

export interface PresencePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A camera, in the same shape the editor uses.
 *
 * `x`/`y` are the world coordinate at the viewport's top-left; `zoom` is world
 * units per screen pixel.
 */
export interface PresenceCamera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface PresenceScreen {
  readonly width: number;
  readonly height: number;
}

export interface PresenceUser {
  readonly id: string;
  readonly name: string;
}

export interface PresenceState {
  /** Taken from the verified editor token — never asserted by the client. */
  readonly user: PresenceUser;
  /**
   * Pointer position in **world** coordinates, or null when the pointer is off
   * the canvas.
   *
   * World rather than screen because collaborators sit at different zoom and
   * pan: two people looking at the same rectangle must see each other's cursor
   * over that rectangle, not over the same screen pixel.
   */
  readonly cursor: PresencePoint | null;
  readonly selection: readonly string[];

  readonly camera: PresenceCamera | null;
  /** Paired with `camera`: the follower needs both to reconstruct a viewport. */
  readonly screen: PresenceScreen | null;
  /** The user id this client is following, if any. */
  readonly following: string | null;
  readonly activity: PresenceActivity;
  /** Author's clock. Liveness only — never used to order anything. */
  readonly lastActive: number;
}

/** A remote peer: their state plus the transport id it arrived under. */
export interface Peer extends PresenceState {
  readonly clientId: number;
}

/**
 * Stop drawing a peer whose record is older than this.
 *
 * The awareness protocol expires an entry roughly 30s after an unclean
 * disconnect, which leaves a frozen cursor on the board long enough to read as
 * a live person. Clients re-stamp `lastActive` on a heartbeat well inside this
 * window, so a peer who is present but simply still is never dropped.
 */
export const PEER_STALE_AFTER_MS = 15_000;

const ACTIVITIES: readonly PresenceActivity[] = ['active', 'idle', 'away'];

/** Longest display name we will render. Bounds text measurement cost. */
const MAX_NAME_LENGTH = 64;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePoint(raw: unknown): PresencePoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  return { x, y };
}

function parseCamera(raw: unknown): PresenceCamera | null {
  if (!raw || typeof raw !== 'object') return null;
  const { x, y, zoom } = raw as { x?: unknown; y?: unknown; zoom?: unknown };
  // A zoom of zero would divide by zero when reconstructing their viewport.
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(zoom) || zoom <= 0) return null;
  return { x, y, zoom };
}

function parseScreen(raw: unknown): PresenceScreen | null {
  if (!raw || typeof raw !== 'object') return null;
  const { width, height } = raw as { width?: unknown; height?: unknown };
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Validate an incoming presence payload, or reject it.
 *
 * This is a trust boundary. Every field is authored by another browser, so a
 * peer running modified code can put anything here: a NaN coordinate
 * propagates into transform maths and silently blanks the cursor layer, an
 * unbounded name string stalls text layout. Returns null rather than throwing —
 * one malformed peer must not take the board down for everyone else.
 */
export function parsePresenceState(raw: unknown): PresenceState | null {
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Record<string, unknown>;
  const user = candidate.user as { id?: unknown; name?: unknown } | undefined;
  if (!user || typeof user.id !== 'string' || user.id.length === 0) return null;

  const name = typeof user.name === 'string' ? user.name : '';
  const activity = candidate.activity as PresenceActivity;

  return {
    user: {
      id: user.id,
      // Trimmed here rather than at the draw call: the renderer measures text
      // before it clips, so an unbounded string is a cost, not just ugly.
      name: name.slice(0, MAX_NAME_LENGTH),
    },
    cursor: parsePoint(candidate.cursor),
    selection: Array.isArray(candidate.selection)
      ? candidate.selection.filter((id): id is string => typeof id === 'string')
      : [],
    camera: parseCamera(candidate.camera),
    screen: parseScreen(candidate.screen),
    following: typeof candidate.following === 'string' ? candidate.following : null,
    activity: ACTIVITIES.includes(activity) ? activity : 'active',
    lastActive: isFiniteNumber(candidate.lastActive) ? candidate.lastActive : 0,
  };
}

/** Whether a peer's record is fresh enough to draw. */
export function isPeerFresh(peer: Peer, now: number): boolean {
  // A zero timestamp means the peer never stamped one; trust the transport's
  // own expiry rather than hiding them immediately.
  if (peer.lastActive === 0) return true;
  return now - peer.lastActive <= PEER_STALE_AFTER_MS;
}

/** First code point of a name, capitalized — the avatar fallback. */
export function presenceInitial(name: string): string {
  // codePointAt, not [0]: a name starting with an emoji or any non-BMP
  // character would otherwise be sliced through the middle of a surrogate pair.
  const first = name.trim().codePointAt(0);
  return (first ? String.fromCodePoint(first) : '?').toUpperCase();
}
