import type { EmbedFrame, EmbedShape } from '@canvasflow/canvas-engine';
import type { Camera } from '../machine/tool-machine.types';
import type { ScreenRect, Size } from '../properties/halo-placement';

/**
 * What a page loaded into an embed may do.
 *
 * Scripts, forms and its own storage, so a player plays and a document keeps
 * its reader signed in to the site it came from. Popups, so a "watch on the
 * site" link still opens — sandboxed as the frame is, so the page it opens
 * cannot pass for this one.
 *
 * Nothing that reaches past the frame: it cannot navigate the board away,
 * put up an alert over it, or start a download. And a page written here
 * rather than loaded from the site — a gist, which is a script — is never
 * given its own origin: sharing the board's would let it lift its own sandbox.
 */
export function embedSandbox(frame: EmbedFrame): string {
  return 'srcdoc' in frame
    ? 'allow-scripts allow-popups'
    : 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation';
}

/** The browser features a player asks for, and nothing beyond them. */
export const EMBED_ALLOW =
  'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';

/** Where a box in world units — an embed's, or one being placed — is on the board. */
export function embedScreenBox(
  shape: { x: number; y: number; width: number; height: number },
  camera: Camera,
): ScreenRect {
  return {
    x: (shape.x - camera.x) * camera.zoom,
    y: (shape.y - camera.y) * camera.zoom,
    width: shape.width * camera.zoom,
    height: shape.height * camera.zoom,
  };
}

export function onBoard(rect: ScreenRect, board: Size): boolean {
  return (
    rect.x + rect.width > 0 &&
    rect.x < board.width &&
    rect.y + rect.height > 0 &&
    rect.y < board.height
  );
}

/**
 * Whether a point, in world units, is in the middle third of the embed both
 * ways — the part a click hands to the page.
 *
 * The rest of the box stays the board's, so an embed can still be pressed
 * and dragged, resized and selected like any other shape without the page
 * taking the press first.
 */
export function inEmbedMiddle(shape: EmbedShape, x: number, y: number): boolean {
  return (
    x >= shape.x + shape.width / 3 &&
    x <= shape.x + (2 * shape.width) / 3 &&
    y >= shape.y + shape.height / 3 &&
    y <= shape.y + (2 * shape.height) / 3
  );
}

/** Longer than this, a press on the middle was a hold, not a click. */
export const EMBED_CLICK_MAX_MS = 300;
/** Further than this, in board pixels, and it was a drag. */
export const EMBED_CLICK_MAX_TRAVEL = 4;
/**
 * How long after the click the page takes presses. Without the wait, the
 * same click reaches the player on a phone and stops the video it started,
 * and a double click opens it full screen.
 */
export const EMBED_OPEN_DELAY_MS = 100;

/**
 * Where a box dragged out with the embed tool ends up, in world units.
 *
 * A drag is taken as drawn, kept from going below the smallest size a page
 * is usable at. A press that barely moved is a click: it places the embed
 * centred on the point, at a video's size until a link says otherwise.
 */
export const EMBED_CLICK_SLOP = 6;
export const DEFAULT_EMBED_BOX = { width: 560, height: 315 } as const;

export interface PlacedBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Placed by a click, so the site's own size may replace it. */
  readonly clicked: boolean;
}

export function embedBoxFromDrag(
  from: { x: number; y: number },
  to: { x: number; y: number },
  zoom: number,
  minSize: number,
): PlacedBox {
  const travel = Math.hypot(to.x - from.x, to.y - from.y) * zoom;
  if (travel < EMBED_CLICK_SLOP) {
    return {
      x: from.x - DEFAULT_EMBED_BOX.width / 2,
      y: from.y - DEFAULT_EMBED_BOX.height / 2,
      ...DEFAULT_EMBED_BOX,
      clicked: true,
    };
  }
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.max(minSize, Math.abs(to.x - from.x)),
    height: Math.max(minSize, Math.abs(to.y - from.y)),
    clicked: false,
  };
}

/** Clear of the sidebar toggle and share button at the top of the board. */
const TOP_CHROME = 64;
const POPOVER_GAP = 10;
const EDGE = 8;

/**
 * Where the link field for an embed being placed sits, in board pixels: under
 * the box while there is room above the toolbar, over it otherwise, and inside
 * its top edge for a box that fills the board.
 */
export function embedPopoverPlacement(
  box: ScreenRect,
  popover: Size,
  board: Size,
  bottomClearance: number,
): { left: number; top: number } {
  const left = Math.max(
    EDGE,
    Math.min(box.x + box.width / 2 - popover.width / 2, board.width - popover.width - EDGE),
  );
  const below = box.y + box.height + POPOVER_GAP;
  if (below + popover.height <= board.height - bottomClearance) return { left, top: below };
  const above = box.y - POPOVER_GAP - popover.height;
  if (above >= TOP_CHROME) return { left, top: above };
  const inside = Math.min(
    Math.max(box.y + POPOVER_GAP, TOP_CHROME),
    board.height - bottomClearance - popover.height,
  );
  return { left, top: Math.max(EDGE, inside) };
}
