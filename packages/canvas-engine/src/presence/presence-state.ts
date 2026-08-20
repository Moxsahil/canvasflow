/**
 * The presence record — one per connected client, carried on the Yjs awareness
 * channel rather than in the document.
 *
 * Awareness state is per-client, expires when its author disconnects, and never
 * reaches `onStoreDocument`, so nothing here is persisted. That separation is
 * deliberate and load-bearing: a cursor moving at frame rate would otherwise
 * become a stream of document updates.
 *
 * Excalidraw splits the same information across three volatile socket messages
 * (MOUSE_LOCATION, IDLE_STATUS, USER_VISIBLE_SCENE_BOUNDS). Awareness holds one
 * object per client, so they collapse into a single record with independently
 * written fields.
 */

/**
 * Whether a peer is at the keyboard.
 *
 * `idle` follows a period without pointer movement; `away` means the tab is
 * hidden, which the Visibility API reports immediately and accurately.
 */
export type PresenceActivity = 'active' | 'idle' | 'away';

export interface PresencePoint {
  readonly x: number;
  readonly y: number;
}

export interface PresenceUser {
  readonly id: string;
  readonly name: string;
}

export interface PresenceState {
  /** From the verified editor token — never client-asserted. */
  readonly user: PresenceUser;
  /**
   * Pointer position in **world** coordinates, or null when the pointer is off
   * the canvas. World rather than screen because peers sit at different zoom
   * and pan; converting on receipt is the only correct option.
   */
  readonly cursor: PresencePoint | null;
  /** Drives the click ripple. */
  readonly button: 'up' | 'down';
  readonly selectedIds: readonly string[];
  readonly activity: PresenceActivity;
  /** Author's clock. Used only for local ghost detection, never for ordering. */
  readonly lastActiveAt: number;
}

/** A remote peer: their state, plus the awareness client id it arrived under. */
export interface Peer extends PresenceState {
  readonly clientId: number;
}

/**
 * A peer is dropped from the rendered set once its state is this stale.
 *
 * The awareness protocol expires an entry roughly 30s after an unclean
 * disconnect, which leaves a frozen cursor sitting on the board for long enough
 * to be read as a live person. We stop drawing well before that and let the
 * protocol catch up on its own schedule.
 */
export const PEER_STALE_AFTER_MS = 15_000;

const ACTIVITIES: readonly PresenceActivity[] = ['active', 'idle', 'away'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePoint(raw: unknown): PresencePoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  return { x, y };
}

/**
 * Validate an awareness payload into a `PresenceState`, or reject it.
 *
 * Awareness states are written by other clients, so this is a trust boundary in
 * the same way shape deserialization is: a peer running modified code can put
 * anything in the map, and a NaN coordinate or a 10MB name string would reach
 * the renderer unchallenged otherwise. Returns null rather than throwing —
 * one malformed peer must not take the board down.
 */
export function parsePresenceState(raw: unknown): PresenceState | null {
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Record<string, unknown>;
  const user = candidate.user as { id?: unknown; name?: unknown } | undefined;

  if (!user || typeof user.id !== 'string' || user.id.length === 0) return null;

  const name = typeof user.name === 'string' ? user.name : '';
  const activity = candidate.activity as PresenceActivity;

  const selectedIds = Array.isArray(candidate.selectedIds)
    ? candidate.selectedIds.filter((id): id is string => typeof id === 'string')
    : [];

  return {
    user: {
      id: user.id,
      // Cap the length here rather than at the draw call: the renderer measures
      // text before it clips, and measuring an unbounded string is the cost.
      name: name.slice(0, 64),
    },
    cursor: parsePoint(candidate.cursor),
    button: candidate.button === 'down' ? 'down' : 'up',
    selectedIds,
    activity: ACTIVITIES.includes(activity) ? activity : 'active',
    lastActiveAt: isFiniteNumber(candidate.lastActiveAt) ? candidate.lastActiveAt : 0,
  };
}

/** First code point of a name, capitalized — the avatar fallback. */
export function presenceInitial(name: string): string {
  // codePointAt, not [0]: a name starting with an emoji or a non-BMP character
  // would otherwise be sliced through the middle of a surrogate pair.
  const first = name.trim().codePointAt(0);
  return (first ? String.fromCodePoint(first) : '?').toUpperCase();
}
