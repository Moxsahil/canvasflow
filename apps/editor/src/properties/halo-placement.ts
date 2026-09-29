/** A box in board pixels: measured from the board's top-left, not the page's. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface HaloPlacement {
  left: number;
  top: number;
  /**
   * Where the bar ended up: over the selection, under it, or docked above the
   * toolbar when there is no selection on screen to follow.
   */
  side: 'above' | 'below' | 'dock';
  /** Whether its menus open upwards — towards whichever side has more room. */
  opensUp: boolean;
}

/** Kept clear of the board's left and right edges. */
const EDGE = 8;
/**
 * The selection outline and its handles stand this far outside the shapes'
 * own bounds, and the bar keeps a further gap from them.
 */
const HANDLE_MARGIN = 8;
const GAP = 12;
/** The top of the board belongs to the sidebar toggle and the share button. */
const TOP_CHROME = 64;
/** The toolbar docked at the bottom, its margin and a gap above it. */
const DOCK_CLEARANCE = 68;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * Where the floating style bar sits for a selection on screen.
 *
 * Centred over the selection, clear of its handles. Where the top of the
 * board leaves no room it goes underneath instead, and a selection too tall
 * for either keeps the bar at the top of the board, over it. With nothing
 * selected — styling the next shape a tool will draw — or with the selection
 * scrolled out of view, there is nothing to follow, and the bar docks above
 * the toolbar where the drawing tools are.
 */
export function haloPlacement(anchor: ScreenRect | null, bar: Size, board: Size): HaloPlacement {
  const maxLeft = board.width - bar.width - EDGE;
  const opensUp = (top: number) => top > board.height - (top + bar.height);

  const onScreen =
    anchor !== null &&
    anchor.x + anchor.width > 0 &&
    anchor.x < board.width &&
    anchor.y + anchor.height > 0 &&
    anchor.y < board.height;

  if (!anchor || !onScreen) {
    const top = board.height - DOCK_CLEARANCE - bar.height;
    return {
      left: clamp((board.width - bar.width) / 2, EDGE, maxLeft),
      top,
      side: 'dock',
      opensUp: true,
    };
  }

  const left = clamp(anchor.x + anchor.width / 2 - bar.width / 2, EDGE, maxLeft);

  const above = anchor.y - HANDLE_MARGIN - GAP - bar.height;
  if (above >= TOP_CHROME) return { left, top: above, side: 'above', opensUp: opensUp(above) };

  const below = anchor.y + anchor.height + HANDLE_MARGIN + GAP;
  if (below + bar.height <= board.height - DOCK_CLEARANCE) {
    return { left, top: below, side: 'below', opensUp: opensUp(below) };
  }

  return { left, top: TOP_CHROME, side: 'above', opensUp: false };
}
