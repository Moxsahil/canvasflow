import { sanitizeShape } from '../sanitize/sanitize-shape.js';
import type { Shape } from '../shapes/shape.js';

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
  /**
   * Whether this peer is mid-laser-stroke right now.
   *
   * One bit rather than the trail itself. Awareness re-broadcasts a client's
   * whole record on every change, so shipping the points would resend a growing
   * array every frame; peers instead rebuild the trail from the cursor samples
   * already arriving on this record, and this flag says which of those samples
   * to join up.
   */
  readonly lasering: boolean;

  /**
   * The shape this peer is drawing right now, before they have finished it.
   *
   * A shape does not enter the document until it is committed, and for good
   * reason: every intermediate drag frame would otherwise become a permanent
   * Yjs operation, and undo would step back through all of them. But that also
   * meant a collaborator saw nothing at all until the mouse came up, which
   * makes drawing together feel like taking turns.
   *
   * So it travels here instead — visible while it happens, never persisted,
   * and gone by itself if the author's tab closes mid-gesture. On commit this
   * clears and the real shape arrives through the document.
   */
  readonly draft: Shape | null;

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
 * The id every parsed draft is given.
 *
 * A draft is never inserted anywhere, only drawn, so it needs an id purely to
 * be a `Shape` at all. Deliberately constant rather than generated: parsing
 * runs on every awareness frame, and a fresh id each time would defeat any
 * caching downstream that keys on it. Drafts from different peers never meet —
 * each is drawn from its own peer record.
 */
const DRAFT_ID = 'peer-draft';

/**
 * Validate a peer's in-progress shape.
 *
 * Routed through the same sanitizer a board file goes through, for the same
 * reason: this is a plain object authored by another browser. A peer running
 * modified code could otherwise put a NaN width or a string where a point list
 * belongs straight into the renderer's geometry maths.
 */
function parseDraft(raw: unknown): Shape | null {
  if (raw === null || raw === undefined) return null;
  return sanitizeShape(raw, () => DRAFT_ID);
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
    // Anything other than an explicit `true` means not lasering. A peer on an
    // older build simply omits it, and reading that as "no" is correct.
    lasering: candidate.lasering === true,
    draft: parseDraft(candidate.draft),
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
