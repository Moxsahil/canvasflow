import type { Point } from '../machine/tool-machine.types';

/**
 * What fingers on the board can do to it, as the board answers it.
 *
 * Pan and zoom arrive a frame at a time, in canvas screen pixels — the same
 * units the wheel uses, so they go through the same camera moves.
 */
export interface TouchNavigation {
  /** The board is about to move under the fingers. */
  begin: () => void;
  pan: (dx: number, dy: number) => void;
  /** Scale by `factor`, keeping what is under `anchor` where it is. */
  zoom: (factor: number, anchor: Point) => void;
  /** The fingers came off with the board moved; it stays where they left it. */
  end: () => void;
  /** The movement wasn't meant — a pencil came down — so the board goes back. */
  cancel: () => void;
  undo: () => void;
  redo: () => void;
}

/**
 * How far a finger has to travel before it moves the board, in screen pixels.
 *
 * A hand settling onto the screen to write drifts a little, and a board that
 * slid under it every time would be worse than one that waited.
 */
export const TOUCH_TRAVEL_SLOP = 10;

/**
 * How quickly every finger of a tap has to be off again, in milliseconds. Long
 * enough for two or three fingers that don't land or lift quite together,
 * short enough that a hand coming to rest is not a tap.
 */
export const MULTI_TAP_MS = 300;

interface Session {
  startedAt: number;
  /** The most fingers down at once, which says what a tap was. */
  most: number;
  /** Any finger past the slop: no longer a tap, and free to move the board. */
  moved: boolean;
  navigating: boolean;
  /** Whether one finger alone may move the board, or it takes two. */
  oneFinger: boolean;
}

interface Frame {
  center: Point;
  /** Between the two oldest fingers; 0 with only one down. */
  distance: number;
}

/**
 * Fingers moving the board: one or two dragging pan it, two pinching zoom it,
 * and a quick tap of two or three is undo or redo.
 *
 * Kept apart from the pointer hook, like the double-press recogniser, so the
 * rules can be driven touch by touch in a test. It hears only the touches the
 * hook has handed to it.
 */
export function createTouchNavigator(nav: TouchNavigation) {
  /** Oldest first: a Map keeps the order its keys went in. */
  const touches = new Map<number, { start: Point; at: Point }>();
  let session: Session | null = null;
  /** Where the fingers were at the last step, which the next is measured from. */
  let last: Frame | null = null;

  const frameOf = (pick: (touch: { start: Point; at: Point }) => Point): Frame => {
    const [a, b] = [...touches.values()].map(pick);
    if (!b) return { center: a!, distance: 0 };
    return {
      center: { x: (a!.x + b.x) / 2, y: (a!.y + b.y) / 2 },
      distance: Math.hypot(b.x - a!.x, b.y - a!.y),
    };
  };

  const start = (oneFinger: boolean, startedAt: number): Session =>
    (session ??= { startedAt, most: 0, moved: false, navigating: false, oneFinger });

  const settle = (time: number) => {
    const ended = session;
    session = null;
    last = null;
    if (!ended) return;
    if (ended.navigating) {
      nav.end();
      return;
    }
    if (ended.moved || time - ended.startedAt > MULTI_TAP_MS) return;
    if (ended.most === 2) nav.undo();
    else if (ended.most === 3) nav.redo();
  };

  const lift = (id: number, time: number): void => {
    if (!touches.delete(id)) return;
    if (touches.size > 0) {
      // One finger lifted from a pinch: the other carries on panning.
      if (session?.navigating) last = frameOf((touch) => touch.at);
      return;
    }
    settle(time);
  };

  return {
    /** Whether this touch is one of ours. */
    has: (id: number) => touches.has(id),

    /** Whether any finger is down here. */
    active: () => touches.size > 0,

    /**
     * A finger landing. `oneFinger` is read from the first of a gesture: it is
     * what pen mode decides, and it holds until every finger is off again.
     */
    down(id: number, at: Point, time: number, oneFinger: boolean): void {
      const current = start(oneFinger, time);
      touches.set(id, { start: at, at });
      current.most = Math.max(current.most, touches.size);
      // Another finger moves the centre and the spread at once; measuring the
      // next step from before it landed would jump the board.
      if (current.navigating) last = frameOf((touch) => touch.at);
    },

    /**
     * A finger that was already a gesture on the board, handed over because a
     * second one landed: the press was a pinch or a tap all along. Taken where
     * it is now, so the board doesn't jump by however far it had come.
     */
    adopt(id: number, at: Point, startedAt: number, moved: boolean): void {
      const current = start(false, startedAt);
      touches.set(id, { start: at, at });
      current.most = Math.max(current.most, touches.size);
      current.moved ||= moved;
    },

    move(id: number, at: Point): void {
      const touch = touches.get(id);
      if (!touch || !session) return;
      touch.at = at;
      if (Math.hypot(at.x - touch.start.x, at.y - touch.start.y) > TOUCH_TRAVEL_SLOP) {
        session.moved = true;
      }

      if (!session.navigating) {
        if (!session.moved || (touches.size === 1 && !session.oneFinger)) return;
        session.navigating = true;
        nav.begin();
        // From where the fingers landed, so the slop they crossed first still
        // counts toward where the board ends up.
        last = frameOf((each) => each.start);
      }

      const now = frameOf((each) => each.at);
      const from = last!;
      nav.pan(now.center.x - from.center.x, now.center.y - from.center.y);
      if (from.distance > 0 && now.distance > 0 && now.distance !== from.distance) {
        nav.zoom(now.distance / from.distance, now.center);
      }
      last = now;
    },

    up: lift,

    /** The system taking a finger away. Whatever it was in, it was no tap. */
    cancel(id: number, time: number): void {
      if (session && touches.has(id)) session.moved = true;
      lift(id, time);
    },

    /**
     * A pencil coming down: the fingers here were a hand settling in to
     * write, so whatever they did to the board is put back. Hands back the
     * touches it held, for the hook to ignore until they lift.
     */
    interrupt(): number[] {
      const held = [...touches.keys()];
      const wasNavigating = session?.navigating ?? false;
      touches.clear();
      session = null;
      last = null;
      if (wasNavigating) nav.cancel();
      return held;
    },
  };
}
