import type { Point, Rect, Shape, SnapGuide } from '@canvasflow/canvas-engine';
import type { HandleIndex } from '../machine/tool-machine.types';
import { boundsSnapPoints, shapeSnapPoints, type Gap, type SnapTargets } from './snap-targets';

/**
 * Two offers this close together are the same offer.
 *
 * Only there to keep floating-point noise from splitting one alignment into
 * two: without it, edges that agree to eleven decimal places would take turns
 * winning and the guide would flicker between them.
 */
const TIE = 0.001;

export interface SnapAxes {
  readonly x: boolean;
  readonly y: boolean;
}

export const BOTH_AXES: SnapAxes = { x: true, y: true };

export interface SnapRequest {
  /** Where the moving thing is right now, before any snap is applied. */
  readonly bounds: Rect;
  /** The points on it that are allowed to line up with something. */
  readonly points: readonly Point[];
  readonly targets: SnapTargets;
  readonly threshold: number;
  readonly axes?: SnapAxes;
  /**
   * Whether even spacing counts as a snap.
   *
   * Only meaningful when the whole thing is free to move. A box being drawn is
   * pinned at the corner the gesture started from, so an offer to shift it
   * bodily into a gap is one it cannot accept.
   */
  readonly gaps?: boolean;
}

export interface SnapResult {
  readonly dx: number;
  readonly dy: number;
  readonly guides: readonly SnapGuide[];
}

export const NO_SNAP: SnapResult = { dx: 0, dy: 0, guides: [] };

/**
 * Whether a gesture snaps, given the preference and whether the override key
 * is down.
 *
 * The key inverts the preference rather than forcing one answer, which is what
 * makes a single modifier serve both people: with snapping off it is how you
 * ask for one alignment, and with snapping on it is how you decline one.
 */
export function snappingActive(preference: boolean, overrideKey: boolean): boolean {
  return preference ? !overrideKey : overrideKey;
}

type Candidate =
  | { readonly kind: 'point'; readonly from: Point; readonly to: Point }
  | { readonly kind: 'gap'; readonly gap: Gap; readonly mode: 'centre' | 'before' | 'after' };

interface Offer {
  readonly offset: number;
  readonly candidate: Candidate;
}

interface AxisSnap {
  readonly offset: number;
  readonly candidates: readonly Candidate[];
}

/**
 * The nearest offer on one axis, and everything else that lands in the same
 * place.
 *
 * The ties are kept rather than discarded because they are the interesting
 * part: three shapes whose tops all agree is one alignment with three pieces of
 * evidence, and drawing only one of them would understate what just happened.
 */
function bestOffer(offers: readonly Offer[]): AxisSnap | null {
  if (offers.length === 0) return null;

  let offset = offers[0]!.offset;
  for (const offer of offers) {
    if (Math.abs(offer.offset) < Math.abs(offset) - TIE) offset = offer.offset;
  }

  return {
    offset,
    candidates: offers
      .filter((offer) => Math.abs(offer.offset - offset) <= TIE)
      .map((offer) => offer.candidate),
  };
}

/**
 * How far the moving thing has to shift to line up with something, and the
 * evidence for it.
 *
 * The two axes are resolved independently, so a shape can take its left edge
 * from one neighbour and its top from another in the same move.
 */
export function resolveSnap(request: SnapRequest): SnapResult {
  const { bounds, points, targets, threshold } = request;
  const axes = request.axes ?? BOTH_AXES;
  const wantGaps = request.gaps ?? true;

  const offersX: Offer[] = [];
  const offersY: Offer[] = [];

  for (const from of points) {
    for (const to of targets.points) {
      if (axes.x) {
        const offset = to.x - from.x;
        if (Math.abs(offset) <= threshold) {
          offersX.push({ offset, candidate: { kind: 'point', from, to } });
        }
      }
      if (axes.y) {
        const offset = to.y - from.y;
        if (Math.abs(offset) <= threshold) {
          offersY.push({ offset, candidate: { kind: 'point', from, to } });
        }
      }
    }
  }

  if (wantGaps && axes.x) {
    collectGapOffers(offersX, bounds, targets.horizontalGaps, true, threshold);
  }
  if (wantGaps && axes.y) {
    collectGapOffers(offersY, bounds, targets.verticalGaps, false, threshold);
  }

  const snapX = bestOffer(offersX);
  const snapY = bestOffer(offersY);
  const dx = snapX?.offset ?? 0;
  const dy = snapY?.offset ?? 0;

  const candidatesX = snapX?.candidates ?? [];
  const candidatesY = snapY?.candidates ?? [];

  return {
    dx,
    dy,
    guides: dedupeGuides([
      ...pointGuides(candidatesX, true, dx, dy),
      ...pointGuides(candidatesY, false, dx, dy),
      ...gapGuides(candidatesX, bounds, true, dx, dy),
      ...gapGuides(candidatesY, bounds, false, dx, dy),
    ]),
  };
}

/**
 * The three things a gap can offer along one axis: sit inside it with equal
 * space either side, or repeat its length off the far side of either shape that
 * defines it.
 */
function collectGapOffers(
  into: Offer[],
  bounds: Rect,
  gaps: readonly Gap[],
  horizontal: boolean,
  threshold: number,
): void {
  const near = horizontal ? bounds.x : bounds.y;
  const size = horizontal ? bounds.width : bounds.height;
  const crossNear = horizontal ? bounds.y : bounds.x;
  const crossFar = crossNear + (horizontal ? bounds.height : bounds.width);

  for (const gap of gaps) {
    // Only something standing in the same lane as the pair has any business
    // filling or repeating their gap.
    if (crossFar <= gap.overlapStart || crossNear >= gap.overlapEnd) continue;

    const offer = (target: number, mode: 'centre' | 'before' | 'after') => {
      const offset = target - near;
      if (Math.abs(offset) <= threshold) {
        into.push({ offset, candidate: { kind: 'gap', gap, mode } });
      }
    };

    // Centring only means anything in a gap with room to spare; in a tighter
    // one it would offer to overlap both neighbours at once.
    if (gap.length > size) {
      offer(gap.start + (gap.length - size) / 2, 'centre');
    }

    const startNear = horizontal ? gap.startBounds.x : gap.startBounds.y;
    const endFar = horizontal
      ? gap.endBounds.x + gap.endBounds.width
      : gap.endBounds.y + gap.endBounds.height;

    offer(startNear - gap.length - size, 'before');
    offer(endFar + gap.length, 'after');
  }
}

function pointGuides(
  candidates: readonly Candidate[],
  horizontal: boolean,
  dx: number,
  dy: number,
): SnapGuide[] {
  // Everything that snapped shares one offset, but not one coordinate: two
  // edges a hundred units apart can both find a partner the same distance
  // away, and those are two separate lines rather than one long one.
  const lines = new Map<number, Point[]>();

  for (const candidate of candidates) {
    if (candidate.kind !== 'point') continue;

    const moved = { x: candidate.from.x + dx, y: candidate.from.y + dy };
    const key = Math.round((horizontal ? candidate.to.x : candidate.to.y) / TIE);
    const points = lines.get(key);
    if (points) points.push(moved, candidate.to);
    else lines.set(key, [moved, candidate.to]);
  }

  return [...lines.values()].map((points) => ({
    kind: 'points' as const,
    points: dedupePoints(points).sort((a, b) => (horizontal ? a.y - b.y : a.x - b.x)),
  }));
}

function gapGuides(
  candidates: readonly Candidate[],
  bounds: Rect,
  horizontal: boolean,
  dx: number,
  dy: number,
): SnapGuide[] {
  const guides: SnapGuide[] = [];

  const movedNear = (horizontal ? bounds.x : bounds.y) + (horizontal ? dx : dy);
  const movedFar = movedNear + (horizontal ? bounds.width : bounds.height);
  const movedCrossNear = (horizontal ? bounds.y : bounds.x) + (horizontal ? dy : dx);
  const movedCrossFar = movedCrossNear + (horizontal ? bounds.height : bounds.width);

  for (const candidate of candidates) {
    if (candidate.kind !== 'gap') continue;
    const { gap, mode } = candidate;

    // Bars run down the middle of the lane every shape involved shares, so they
    // read as measuring the space between those shapes and not something else.
    const lane =
      (Math.max(gap.overlapStart, movedCrossNear) + Math.min(gap.overlapEnd, movedCrossFar)) / 2;

    const bar = (from: number, to: number) => {
      guides.push({
        kind: 'gap',
        direction: horizontal ? 'horizontal' : 'vertical',
        from: alongAcross(from, lane, horizontal),
        to: alongAcross(to, lane, horizontal),
      });
    };

    if (mode === 'centre') {
      // The gap being split, shown as the two halves it became.
      bar(gap.start, movedNear);
      bar(movedFar, gap.end);
      continue;
    }

    // A repeated gap is only convincing next to the one it copied, so both are
    // drawn: the new span, then the original.
    if (mode === 'before') {
      bar(movedFar, horizontal ? gap.startBounds.x : gap.startBounds.y);
    } else {
      bar(
        horizontal ? gap.endBounds.x + gap.endBounds.width : gap.endBounds.y + gap.endBounds.height,
        movedNear,
      );
    }
    bar(gap.start, gap.end);
  }

  return guides;
}

function alongAcross(along: number, across: number, horizontal: boolean): Point {
  return horizontal ? { x: along, y: across } : { x: across, y: along };
}

function dedupePoints(points: readonly Point[]): Point[] {
  const seen = new Set<string>();
  const unique: Point[] = [];
  for (const point of points) {
    const key = `${Math.round(point.x / TIE)},${Math.round(point.y / TIE)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  return unique;
}

function guideKey(guide: SnapGuide): string {
  if (guide.kind === 'points') {
    return `p:${guide.points.map((point) => `${point.x},${point.y}`).join('|')}`;
  }
  return `g:${guide.direction}:${guide.from.x},${guide.from.y},${guide.to.x},${guide.to.y}`;
}

/**
 * Two gaps of the same length either side of the same shape produce the same
 * bar twice, and drawing it twice makes it look thicker than the others.
 */
function dedupeGuides(guides: readonly SnapGuide[]): SnapGuide[] {
  const seen = new Set<string>();
  const unique: SnapGuide[] = [];
  for (const guide of guides) {
    const key = guideKey(guide);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(guide);
  }
  return unique;
}

/** Whether two sets of guides would draw the same thing. */
export function guidesEqual(a: readonly SnapGuide[], b: readonly SnapGuide[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((guide, index) => guideKey(guide) === guideKey(b[index]!));
}

/**
 * Put a single point exactly on the nearest thing worth landing on.
 *
 * Different in kind from the alignment above, which answers two independent
 * questions about coordinates. This asks one question about a position: the end
 * of a line has somewhere it is trying to reach, and lining it up with two
 * unrelated shapes at once is not it. Distance decides, so the answer is a
 * corner or an edge centre and never the halfway house between two of them.
 */
export function nearestTargetPoint(
  point: Point,
  targets: SnapTargets,
  threshold: number,
): SnapResult {
  let best: Point | null = null;
  let bestDistance = threshold;

  for (const target of targets.points) {
    const distance = Math.hypot(target.x - point.x, target.y - point.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = target;
    }
  }

  if (!best) return NO_SNAP;

  return {
    dx: best.x - point.x,
    dy: best.y - point.y,
    // One point, so the line through it has no length and what shows is the
    // cross: a mark on the spot rather than a claim about an alignment.
    guides: [{ kind: 'points', points: [best] }],
  };
}

/**
 * Which points of a resized box are being moved by a given handle, and which
 * axes they are free to move on.
 *
 * A corner is one point that can go anywhere, so it snaps on both axes. An edge
 * handle moves two corners along a single axis, and offering to snap the other
 * one would move an edge the gesture is holding still.
 */
export function resizeSnapPoints(
  bounds: Rect,
  handle: HandleIndex,
): { readonly points: readonly Point[]; readonly axes: SnapAxes } {
  const { x, y, width, height } = bounds;
  const right = x + width;
  const bottom = y + height;

  switch (handle) {
    case 0:
      return { points: [{ x, y }], axes: BOTH_AXES };
    case 2:
      return { points: [{ x: right, y }], axes: BOTH_AXES };
    case 4:
      return { points: [{ x: right, y: bottom }], axes: BOTH_AXES };
    case 6:
      return { points: [{ x, y: bottom }], axes: BOTH_AXES };
    case 1:
      return {
        points: [
          { x, y },
          { x: right, y },
        ],
        axes: { x: false, y: true },
      };
    case 5:
      return {
        points: [
          { x, y: bottom },
          { x: right, y: bottom },
        ],
        axes: { x: false, y: true },
      };
    case 3:
      return {
        points: [
          { x: right, y },
          { x: right, y: bottom },
        ],
        axes: { x: true, y: false },
      };
    case 7:
      return {
        points: [
          { x, y },
          { x, y: bottom },
        ],
        axes: { x: true, y: false },
      };
    default: {
      const unhandled: never = handle;
      void unhandled;
      return { points: [], axes: { x: false, y: false } };
    }
  }
}

/**
 * The points a selection offers while it is being dragged.
 *
 * A lone shape offers its own geometry, so an ellipse lines up by the points
 * its outline passes through. Several at once offer the box around them
 * instead: what is being moved is the group, and its members' individual edges
 * are not what anyone is aiming with.
 */
export function dragSnapPoints(
  shapes: readonly Shape[],
  bounds: Rect,
  midpoints: boolean,
): Point[] {
  if (shapes.length === 1) return shapeSnapPoints(shapes[0]!, midpoints);
  return boundsSnapPoints(bounds, { corners: true, midpoints });
}
