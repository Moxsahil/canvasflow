import { shapeBounds, type Shape } from '@canvasflow/canvas-engine';
import type { Camera } from '../machine/tool-machine.types';
import { DOCK_CLEARANCE, type ScreenRect, type Size } from '../properties/halo-placement';

/** Kept clear of the board's left and right edges. */
const EDGE = 8;
/**
 * The selection outline and its handles stand this far outside the shapes'
 * own bounds, and the box keeps a further gap from them — the same clearance
 * the floating style bar keeps.
 */
const HANDLE_MARGIN = 8;
const GAP = 12;
/** Between the box and the style bar, when the two share a side. */
const STACK_GAP = 6;
/** The top of the board belongs to the sidebar toggle and the share button. */
const TOP_CHROME = 64;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

const overlaps = (a: ScreenRect, b: ScreenRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Where the link box sits for a selected shape, in board pixels — or null
 * when the shape is off screen and there is nothing for it to belong to.
 *
 * Under the selection by preference: the floating style bar takes the space
 * above it, so the two sit either side of the shape rather than fighting for
 * one spot. Above when the bottom of the board has no room. And where the
 * style bar has been pushed to the same side, the box stacks beyond it
 * rather than over it — `avoid` is where the bar stands, or null without one.
 *
 * A selection too tall for either side keeps the box at the bottom of the
 * board, above the toolbar, over the selection.
 */
export function linkBoxPlacement(
  anchor: ScreenRect,
  box: Size,
  board: Size,
  avoid: ScreenRect | null,
): { left: number; top: number } | null {
  const onScreen =
    anchor.x + anchor.width > 0 &&
    anchor.x < board.width &&
    anchor.y + anchor.height > 0 &&
    anchor.y < board.height;
  if (!onScreen) return null;

  const left = clamp(
    anchor.x + anchor.width / 2 - box.width / 2,
    EDGE,
    board.width - box.width - EDGE,
  );
  const floor = board.height - DOCK_CLEARANCE;

  const candidates = [
    anchor.y + anchor.height + HANDLE_MARGIN + GAP,
    anchor.y - HANDLE_MARGIN - GAP - box.height,
  ];
  if (avoid) {
    candidates.push(avoid.y + avoid.height + STACK_GAP, avoid.y - STACK_GAP - box.height);
  }

  const fits = (top: number) =>
    top >= TOP_CHROME &&
    top + box.height <= floor &&
    !(avoid && overlaps(avoid, { x: left, y: top, width: box.width, height: box.height }));

  const top = candidates.find(fits) ?? Math.max(TOP_CHROME, floor - box.height);
  return { left, top };
}

/** The badge's side, in screen pixels: it keeps its size at every zoom. */
export const LINK_BADGE_SIZE = 22;
/** Between the shape's top-right corner and the badge. */
const BADGE_OFFSET = 4;
/**
 * Below this zoom the badges go. A board seen from that far out is being
 * looked over rather than read, and a badge on every linked shape would
 * crowd out the shapes themselves.
 */
export const LINK_BADGE_MIN_ZOOM = 0.25;

export interface LinkBadgePlacement {
  readonly id: string;
  readonly link: string;
  readonly left: number;
  readonly top: number;
}

/**
 * A badge for every linked shape on screen, just off its top-right corner —
 * outside the shape, so it covers none of what is drawn, and where a resize
 * handle would stand, so it reads as belonging to that shape.
 *
 * `except` is the shape whose link box is showing: the box says the same
 * thing in full, and the badge would sit under that shape's own handle.
 */
export function linkBadgePlacements(
  shapes: readonly Shape[],
  camera: Camera,
  board: Size,
  except: string | null,
): LinkBadgePlacement[] {
  if (camera.zoom < LINK_BADGE_MIN_ZOOM) return [];

  const badges: LinkBadgePlacement[] = [];
  for (const shape of shapes) {
    if (!shape.link || shape.id === except) continue;

    const bounds = shapeBounds(shape);
    const left = (bounds.x + bounds.width - camera.x) * camera.zoom + BADGE_OFFSET;
    const top = (bounds.y - camera.y) * camera.zoom - BADGE_OFFSET - LINK_BADGE_SIZE;
    const onScreen =
      left + LINK_BADGE_SIZE > 0 &&
      left < board.width &&
      top + LINK_BADGE_SIZE > 0 &&
      top < board.height;
    if (onScreen) badges.push({ id: shape.id, link: shape.link, left, top });
  }
  return badges;
}

/**
 * Where a link opens: in place for a page of this app, so following a link to
 * another board is a step rather than a new tab to close; anywhere else in a
 * tab of its own, leaving the board where it was.
 */
export function linkTarget(link: string, origin: string): '_self' | '_blank' {
  try {
    return new URL(link).origin === origin ? '_self' : '_blank';
  } catch {
    return '_blank';
  }
}

/** This page's origin, or none where there is no page — a server render. */
export function currentOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** This page's address, or none where there is no page — a server render. */
export function currentHref(): string {
  return typeof window === 'undefined' ? '' : window.location.href;
}
