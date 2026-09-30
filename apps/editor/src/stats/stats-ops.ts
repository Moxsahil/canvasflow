/**
 * What the numbers in the stats panel are, and what changing one does.
 *
 * The panel reads a shape as the box around it — where that box is and how big
 * — and as its font size where it is text. Everything here works from that
 * box, not from the fields a shape happens to store: a line has no width to
 * read, and centred text keeps its `x` in the middle of what is drawn.
 */

import {
  computeBoundingRect,
  descendantsOf,
  isFrame,
  isImage,
  isText,
  membershipAfterResize,
  shapeBounds,
  type FrameShape,
  type Shape,
} from '@canvasflow/canvas-engine';
import { assignmentsAfterMove, type FrameAssignment } from '../frames/frame-ops';
import { MAX_TEXT_FONT_SIZE, MIN_TEXT_FONT_SIZE } from '../machine/tool-machine';

export type StatsProperty = 'x' | 'y' | 'width' | 'height' | 'fontSize';

/** What a field shows for a selection whose shapes disagree. */
export const MIXED = 'Mixed';
export type StatsValue = number | typeof MIXED;

/**
 * How a change arrives: a number typed into a field, or a distance the
 * field's label has been dragged since the drag began.
 */
export type StatsEdit =
  | { readonly kind: 'set'; readonly value: number }
  | { readonly kind: 'scrub'; readonly change: number; readonly byStep: boolean };

/** The fields of a shape an edit from the panel can write. */
export interface StatsGeometry {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
}

export interface StatsPatch {
  readonly id: string;
  readonly patch: StatsGeometry;
}

/** A box is never narrower or shorter than this, as when it is dragged. */
const MIN_SIZE = 1;
/** What a drag moves in with Shift held: tens for a box, fours for a font. */
const STEP = 10;
const FONT_STEP = 4;

const round2 = (value: number) => Math.round(value * 100) / 100;
const round1 = (value: number) => Math.round(value * 10) / 10;
const toStep = (value: number, step: number) => Math.round(value / step) * step;
const clampFont = (size: number) =>
  Math.min(MAX_TEXT_FONT_SIZE, Math.max(MIN_TEXT_FONT_SIZE, size));

function read(shape: Shape, property: StatsProperty): number | null {
  if (property === 'fontSize') return isText(shape) ? round1(shape.fontSize) : null;
  const bounds = shapeBounds(shape);
  return round2(bounds[property]);
}

/**
 * Whether the panel can change this about a shape.
 *
 * Anything can be moved. Size is another matter for a line, an arrow or a
 * drawing: they are their points, with no box of their own to stretch, and the
 * board has no handles to resize them by either. Their size is shown, since it
 * is true and worth knowing, and left at that.
 */
export function isStatsEditable(shape: Shape, property: StatsProperty): boolean {
  switch (property) {
    case 'x':
    case 'y':
      return true;
    case 'width':
    case 'height':
      return shape.kind !== 'line' && shape.kind !== 'arrow' && shape.kind !== 'freehand';
    case 'fontSize':
      return isText(shape);
  }
}

/**
 * The one value a field shows for these shapes: the value they share, "Mixed"
 * where they differ, or null where the property applies to none of them — a
 * font size, with no text selected.
 */
export function statsValue(shapes: readonly Shape[], property: StatsProperty): StatsValue | null {
  const values = shapes.map((shape) => read(shape, property)).filter((value) => value !== null);
  if (values.length === 0) return null;
  return new Set(values).size === 1 ? values[0]! : MIXED;
}

/** The size of everything on the board taken together, to the nearest unit. */
export function boardSize(shapes: readonly Shape[]): { width: number; height: number } {
  const bounds = computeBoundingRect(shapes);
  if (!bounds) return { width: 0, height: 0 };
  return {
    width: Math.round(bounds.x + bounds.width) - Math.round(bounds.x),
    height: Math.round(bounds.y + bounds.height) - Math.round(bounds.y),
  };
}

/**
 * Where an edit puts one value.
 *
 * A typed number is taken as it is. A drag lands on whole units, and with
 * Shift on multiples of `step` — of the value itself for a single shape, so it
 * walks a grid, and of the distance dragged for several, so they keep their
 * places relative to each other.
 */
function target(current: number, edit: StatsEdit, step: number, together: boolean): number {
  if (edit.kind === 'set') return edit.value;
  if (!edit.byStep) return Math.round(current + edit.change);
  return together
    ? Math.round(current + toStep(edit.change, step))
    : toStep(current + edit.change, step);
}

function moved(shape: Shape, property: 'x' | 'y', to: number): StatsGeometry | null {
  const delta = to - shapeBounds(shape)[property];
  return delta === 0 ? null : { [property]: shape[property] + delta };
}

function resized(shape: Shape, property: 'width' | 'height', to: number): StatsGeometry | null {
  const bounds = shapeBounds(shape);
  const current = bounds[property];
  const next = Math.max(MIN_SIZE, to);
  if (next === current || current <= 0) return null;

  if (isText(shape)) {
    // Text is as big as its font makes it, so its box is changed through the
    // font — by as much as the limits on a font size allow.
    const fontSize = clampFont(shape.fontSize * (next / current));
    if (fontSize === shape.fontSize) return null;
    const width = bounds.width * (fontSize / shape.fontSize);
    // The left edge stays put, as it does for a box. Centred and right-aligned
    // text keep their `x` further along, and it has to follow the new width.
    const x =
      shape.textAlign === 'center'
        ? bounds.x + width / 2
        : shape.textAlign === 'right'
          ? bounds.x + width
          : shape.x;
    return { fontSize, x };
  }

  if (isImage(shape)) {
    // A picture keeps its proportions: asked for a width, it takes the height
    // that goes with it.
    const ratio = bounds.width / bounds.height;
    return property === 'width'
      ? { width: next, height: Math.max(MIN_SIZE, round2(next / ratio)) }
      : { height: next, width: Math.max(MIN_SIZE, round2(next * ratio)) };
  }

  return { [property]: next };
}

function fontSized(shape: Shape, to: number): StatsGeometry | null {
  if (!isText(shape)) return null;
  const fontSize = clampFont(Math.round(to));
  return fontSize === shape.fontSize ? null : { fontSize };
}

/**
 * What an edit writes.
 *
 * `originals` are the selected shapes as they were when the edit began, and
 * `board` is everything as it was then. A drag is worked out from that fixed
 * start every time it moves, never from what the move before it wrote, so the
 * shapes track the pointer instead of drifting from it by a rounding at a time.
 *
 * A frame takes what is standing in it along when it moves, as it does when
 * dragged. A shape the edit cannot change — the width of a line — is left out.
 */
export function applyStatsEdit(
  property: StatsProperty,
  edit: StatsEdit,
  originals: readonly Shape[],
  board: readonly Shape[],
): StatsPatch[] {
  const together = originals.length > 1;
  const patches = new Map<string, StatsGeometry>();
  const carried = new Map<string, StatsGeometry>();

  for (const shape of originals) {
    if (!isStatsEditable(shape, property)) continue;

    let patch: StatsGeometry | null;
    if (property === 'x' || property === 'y') {
      const from = shapeBounds(shape)[property];
      patch = moved(shape, property, target(from, edit, STEP, together));
      if (patch && isFrame(shape)) {
        const delta = patch[property]! - shape[property];
        for (const member of descendantsOf(shape.id, board)) {
          carried.set(member.id, { [property]: member[property] + delta });
        }
      }
    } else if (property === 'fontSize') {
      patch = isText(shape)
        ? fontSized(shape, target(shape.fontSize, edit, FONT_STEP, together))
        : null;
    } else {
      const from = shapeBounds(shape)[property];
      const to = edit.kind === 'set' ? edit.value : target(Math.max(0, from), edit, STEP, together);
      patch = resized(shape, property, to);
    }

    if (patch) patches.set(shape.id, patch);
  }

  // A shape selected along with its frame is placed by its own edit, not
  // carried by the frame's as well — that would move it twice.
  const selected = new Set(originals.map((shape) => shape.id));
  for (const [id, patch] of carried) {
    if (!selected.has(id)) patches.set(id, patch);
  }

  return [...patches].map(([id, patch]) => ({ id, patch }));
}

/**
 * Which frame each edited shape belongs in, once an edit has settled, limited
 * to what changed.
 *
 * Asked at the end rather than along the way, as it is for a drag: a shape
 * scrubbed across a frame on its way somewhere else should not join and leave
 * it on the wire. A frame that was resized is the reverse question — what its
 * edges now take in or let go.
 */
export function membershipAfterStatsEdit(
  property: StatsProperty,
  ids: readonly string[],
  board: readonly Shape[],
): FrameAssignment[] {
  if (property !== 'width' && property !== 'height') return assignmentsAfterMove(ids, board);

  const edited = new Set(ids);
  const frames = board.filter(
    (shape): shape is FrameShape => edited.has(shape.id) && isFrame(shape),
  );
  const resizedFrames = new Set(frames.map((frame) => frame.id));

  return [
    ...frames.flatMap((frame) => membershipAfterResize(frame, board)),
    ...assignmentsAfterMove(
      ids.filter((id) => !resizedFrames.has(id)),
      board,
    ),
  ];
}
