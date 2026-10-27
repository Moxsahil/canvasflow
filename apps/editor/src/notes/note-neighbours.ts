import {
  arrowsAffectedBy,
  boundArrowPatches,
  createNote,
  isNote,
  noteBounds,
  pointInRect,
  shapeScale,
  type NoteShape,
  type Rect,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { Camera, Point } from '../machine/tool-machine.types';

/** Which way from a note the next one goes. */
export type NoteSide = 'up' | 'right' | 'down' | 'left';

export const NOTE_SIDES: readonly NoteSide[] = ['up', 'right', 'down', 'left'];

/** The space left between two notes laid side by side, at 1:1. */
export const NOTE_GAP = 10;

/**
 * How near, in screen pixels, a note has to come to a free spot beside
 * another before it settles into it. Small, so a note put down on purpose a
 * little way off stays where it was put.
 */
export const NOTE_SPOT_RADIUS = 10;

interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Where the top-left of a note of `size` stands on `side` of `note`, the gap
 * between them. Lined up with the top of a note beside it and the left of one
 * above or below — the edges a row or a column of notes shares. Below means
 * below the paper as drawn, which words may have made taller than it was put
 * down.
 */
export function spotBeside(note: NoteShape, side: NoteSide, size: Size): Point {
  const paper = noteBounds(note);
  const gap = NOTE_GAP * shapeScale(note);
  switch (side) {
    case 'right':
      return { x: paper.x + paper.width + gap, y: paper.y };
    case 'left':
      return { x: paper.x - gap - size.width, y: paper.y };
    case 'down':
      return { x: paper.x, y: paper.y + paper.height + gap };
    case 'up':
      return { x: paper.x, y: paper.y - gap - size.height };
  }
}

/** The note on top at `point`, other than the ones left out. */
export function noteAt(
  shapes: readonly Shape[],
  point: Point,
  except: ReadonlySet<string> = new Set(),
): NoteShape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i]!;
    if (isNote(shape) && !except.has(shape.id) && pointInRect(point, noteBounds(shape))) {
      return shape;
    }
  }
  return null;
}

const centreOf = (at: Point, size: Size): Point => ({
  x: at.x + size.width / 2,
  y: at.y + size.height / 2,
});

/**
 * What is on `side` of a note: the note already standing there, or a fresh
 * one to put there — blank, the same size and style as the one it came from,
 * signed by `author`.
 *
 * A note counts as there when the middle of where the new one would go is on
 * its paper, so carrying on along a row moves into the notes already in it
 * rather than piling new ones on top of them.
 */
export function noteBeside(
  note: NoteShape,
  side: NoteSide,
  shapes: readonly Shape[],
  id: string,
  author: string | undefined,
): { readonly existing: NoteShape } | { readonly created: NoteShape } {
  const size = { width: note.width, height: note.height };
  const at = spotBeside(note, side, size);
  const existing = noteAt(shapes, centreOf(at, size), new Set([note.id]));
  if (existing) return { existing };
  return {
    created: createNote({
      id,
      x: at.x,
      y: at.y,
      width: note.width,
      height: note.height,
      fontSize: note.fontSize,
      fontFamily: note.fontFamily,
      textAlign: note.textAlign,
      strokeColor: note.strokeColor,
      fillColor: note.fillColor,
      opacity: note.opacity,
      ...(note.scale !== undefined && { scale: note.scale }),
      ...(author && { author }),
    }),
  };
}

/**
 * The empty places beside the notes on the board where `moving` would fit:
 * the top-left it would have in each. Notes in `except` — the ones being
 * moved — neither offer places nor fill them. A turned note has no row to
 * line up with, and is passed over.
 */
export function freeNoteSpots(
  shapes: readonly Shape[],
  moving: NoteShape,
  except: ReadonlySet<string>,
): Point[] {
  const paper = noteBounds(moving);
  const size = { width: paper.width, height: paper.height };
  const spots: Point[] = [];
  for (const shape of shapes) {
    if (!isNote(shape) || except.has(shape.id) || shape.rotation !== 0) continue;
    for (const side of NOTE_SIDES) {
      const at = spotBeside(shape, side, size);
      if (!noteAt(shapes, centreOf(at, size), except)) spots.push(at);
    }
  }
  return spots;
}

/**
 * How far to move a note whose top-left is at `at` to settle it into the
 * nearest of `spots` within `radius`, or null when none is that near.
 */
export function nudgeIntoSpot(
  at: Point,
  spots: readonly Point[],
  radius: number,
): { readonly dx: number; readonly dy: number } | null {
  let best: { dx: number; dy: number } | null = null;
  let nearest = radius;
  for (const spot of spots) {
    const dx = spot.x - at.x;
    const dy = spot.y - at.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= nearest) {
      nearest = distance;
      best = { dx, dy };
    }
  }
  return best;
}

/**
 * Copies of shapes, with every note among them signed by whoever made the
 * copy — `author`, or nobody where nobody is signed in. Whoever copied a note
 * is the one answering for what goes on it next.
 */
export function signedCopies(shapes: readonly Shape[], author: string | undefined): Shape[] {
  return shapes.map((shape) => {
    if (!isNote(shape)) return shape;
    const { author: _copiedFrom, ...unsigned } = shape;
    return author ? { ...unsigned, author } : unsigned;
  });
}

/**
 * The camera moved just far enough to show the whole of `rect`, `inset`
 * screen pixels clear of the edges, or the same camera when it already does.
 * The zoom is left alone: this follows the work along, it does not reframe it.
 */
export function cameraShowing(rect: Rect, camera: Camera, viewport: Size, inset: number): Camera {
  const margin = inset / camera.zoom;
  const viewWidth = viewport.width / camera.zoom;
  const viewHeight = viewport.height / camera.zoom;
  const along = (start: number, length: number, from: number, span: number) => {
    if (start - margin < from) return start - margin;
    if (start + length + margin > from + span) {
      // Larger than the view: its start is the end worth seeing.
      return Math.min(start - margin, start + length + margin - span);
    }
    return from;
  };
  const x = along(rect.x, rect.width, camera.x, viewWidth);
  const y = along(rect.y, rect.height, camera.y, viewHeight);
  return x === camera.x && y === camera.y ? camera : { ...camera, x, y };
}

/**
 * The board with the arrows attached to `changed` redrawn to meet them where
 * they are now drawn: notes whose words are being typed, here or by someone
 * else, and growing as they go. For drawing only — the arrows are written
 * where they belong once the words are.
 */
export function withArrowsFollowing(
  shapes: readonly Shape[],
  changed: ReadonlySet<string>,
): readonly Shape[] {
  if (changed.size === 0) return shapes;
  const arrows = arrowsAffectedBy(shapes, changed);
  if (arrows.length === 0) return shapes;
  const patches = new Map(
    boundArrowPatches(arrows, new Map(shapes.map((shape) => [shape.id, shape]))).map((patch) => [
      patch.id,
      patch,
    ]),
  );
  return shapes.map((shape) => {
    const patch = patches.get(shape.id);
    return patch ? ({ ...shape, x: patch.x, y: patch.y, points: patch.points } as Shape) : shape;
  });
}
