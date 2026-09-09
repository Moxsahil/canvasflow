import type { Point } from '../machine/tool-machine.types';

/**
 * What a drag does once it runs out of viewport.
 *
 * A gesture that reaches the edge of the board is usually not finished — the
 * shape is meant to land somewhere that isn't on screen yet. Rather than make
 * you drop it, scroll, and pick it up again, the view keeps moving in the
 * direction the pointer is pressing.
 *
 * The rules are arithmetic over a pointer position and a stopwatch, kept apart
 * from the frame loop that runs them so the feel can be read — and tested —
 * without standing up a canvas.
 */

/**
 * How far in from each edge the band reaches, in screen pixels.
 *
 * Narrow on purpose. This is somewhere a drag is taken deliberately; widen it
 * and every gesture that merely finishes near an edge sets the whole board
 * moving underneath it.
 */
export const EDGE_BAND_PX = 8;

/**
 * How long the pointer holds inside the band before the view moves at all.
 *
 * The band is small enough that a fast drag crosses it in a frame or two on
 * the way past. Waiting this out is what separates "I am pushing against the
 * edge" from "I passed near the edge".
 */
export const EDGE_SCROLL_DELAY_MS = 200;

/** How long it then takes to reach full speed. */
export const EDGE_SCROLL_EASE_MS = 200;

/** Screen pixels a second at full speed, on a viewport wide enough to want it. */
export const EDGE_SCROLL_SPEED = 1200;

/**
 * The shortest time a scroll is allowed to take to cross the viewport.
 *
 * Full speed is tuned for a desktop window. On a small one it would clear the
 * whole visible board between two frames of your reaction time, so the speed
 * is capped per axis by how much there is to cross. Phrased as a duration
 * rather than a breakpoint so a window being resized changes the feel
 * gradually instead of stepping between two speeds.
 */
export const EDGE_SCROLL_MIN_TRAVERSAL_MS = 800;

/**
 * A frame longer than this is not a slow frame — it is a tab that was in the
 * background, or a main thread that stalled. Counting it in full would move
 * the board by however long you were away.
 */
const MAX_FRAME_MS = 64;

/**
 * How deep into an edge band the pointer sits, per axis.
 *
 * Zero anywhere in the middle; -1 hard against the near edge (left, top) and
 * 1 against the far one. A drag holds pointer capture, so the pointer can be
 * outside the canvas entirely — that saturates rather than reading as further.
 */
export interface EdgeProximity {
  readonly x: number;
  readonly y: number;
}

/** Screen pixels the view should move this frame. Positive is right and down. */
export interface EdgeScrollPush {
  readonly dx: number;
  readonly dy: number;
}

function axisProximity(position: number, size: number): number {
  if (size <= 0) return 0;
  if (position < EDGE_BAND_PX) {
    return -Math.min(1, (EDGE_BAND_PX - position) / EDGE_BAND_PX);
  }
  const far = size - EDGE_BAND_PX;
  if (position > far) {
    return Math.min(1, (position - far) / EDGE_BAND_PX);
  }
  return 0;
}

/**
 * @param point - Pointer position within the canvas, in screen pixels.
 */
export function edgeProximity(point: Point, width: number, height: number): EdgeProximity {
  return { x: axisProximity(point.x, width), y: axisProximity(point.y, height) };
}

export function isNearEdge(proximity: EdgeProximity): boolean {
  return proximity.x !== 0 || proximity.y !== 0;
}

/**
 * Eases from a standing start rather than from wherever the delay left off, so
 * the board picks up from still. A ramp that begins at some fraction of full
 * speed reads as a lurch, which is the thing the delay was there to avoid.
 */
function ease(heldMs: number): number {
  if (heldMs <= EDGE_SCROLL_DELAY_MS) return 0;
  const t = Math.min(1, (heldMs - EDGE_SCROLL_DELAY_MS) / EDGE_SCROLL_EASE_MS);
  return t * t * t;
}

function axisSpeed(size: number): number {
  return Math.min(EDGE_SCROLL_SPEED, (size * 1000) / EDGE_SCROLL_MIN_TRAVERSAL_MS);
}

/**
 * Measured against the clock rather than counted per frame, so the board
 * travels the same distance in the same time whether the display runs at 60Hz
 * or 120Hz.
 *
 * The result is deliberately in screen pixels and not world units: the content
 * should slide past at one rate however far the board is zoomed, which is the
 * rate your hand is expecting to have to keep up with.
 *
 * @param heldMs - How long the pointer has sat inside a band without leaving.
 * @param elapsedMs - Length of the frame being drawn.
 */
export function edgeScrollPush(
  proximity: EdgeProximity,
  width: number,
  height: number,
  heldMs: number,
  elapsedMs: number,
): EdgeScrollPush {
  const eased = ease(heldMs);
  if (eased === 0) return { dx: 0, dy: 0 };

  const seconds = Math.min(elapsedMs, MAX_FRAME_MS) / 1000;
  return {
    dx: proximity.x * eased * axisSpeed(width) * seconds,
    dy: proximity.y * eased * axisSpeed(height) * seconds,
  };
}
