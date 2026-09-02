import type { Rect } from '../math.js';
import type { Vec2 } from '../geometry/segment.js';
import { strokeFeatures, type StrokeFeatures } from './stroke-features.js';
import { farthestFrom } from './stroke-features.js';

/**
 * What a rough stroke was taken to be.
 *
 * An outline is answered with the box to draw it in; a straight mark is
 * answered with its two ends, since a box would lose which way round it went.
 */
export type StrokeVerdict =
  | { readonly kind: 'rectangle' | 'ellipse' | 'diamond'; readonly bounds: Rect }
  | { readonly kind: 'line' | 'arrow'; readonly from: Vec2; readonly to: Vec2 };

/**
 * How large a stroke's longer side must be on screen, in pixels, for
 * recognition to run at all.
 *
 * Measured after zoom rather than in world units, so the same physical gesture
 * behaves the same however far the board is zoomed in. Below this a stroke is
 * a flick or a slip, and guessing at it would be worse than leaving it alone.
 */
const MIN_APPARENT_SIZE = 25;

/**
 * How far apart a stroke's ends may drift, relative to its own length, and
 * still count as having closed.
 */
const OPEN_STROKE_GAP = 0.15;

/** How thick an open stroke's point cloud may be and still count as straight. */
const STRAIGHT_MAX_SPREAD = 0.25;

/** How far an open stroke may wander off its own chord and still count as straight. */
const STRAIGHT_MAX_DRIFT = 0.15;

/** How lopsided a straight stroke must be before its heavy end reads as an arrowhead. */
const ARROW_MIN_SKEW = 0.3;

/**
 * How far a stroke may sit from the nearest outline before it is left alone,
 * measured in tolerances rather than in any one feature's units.
 */
const MAX_OUTLINE_DISTANCE = 1.5;

/**
 * How lopsided a closed stroke may be and still be one of the outlines here.
 *
 * A rectangle, an ellipse and a diamond are all symmetric about both screen
 * axes, so anything drawn with its weight along one edge — a triangle above
 * all, which every other measurement mistakes for a diamond — was something
 * else, and is better left as the stroke it was.
 *
 * Set in the gap between the two families as measured over many hands: a
 * rectangle, oval or diamond stays under 0.15 however unsteadily it is drawn,
 * a strongly tapered trapezoid reaches 0.34, and a triangle drawn wider than
 * it is tall — which is how one is almost always drawn — starts at 0.41.
 *
 * The limit is triangles drawn much taller than they are wide. Their two long
 * sides carry most of the outline and are themselves symmetric, which leaves
 * too little weight on the base to tell them from a diamond; one of those
 * still becomes a diamond rather than staying a stroke.
 */
const MAX_LOPSIDEDNESS = 0.38;

/**
 * What each outline measures, against the tolerances below.
 *
 * `boxFill` and `spreadProduct` are the exact figures for the shapes
 * themselves — see {@link StrokeFeatures} — and hand-drawn strokes land within
 * a few hundredths of them.
 *
 * `cornerShare` cannot be derived the same way, because it depends on the
 * window the turning is measured over as much as on the shape, and a wobbling
 * hand adds turning all along the sides that no ideal outline has. These two
 * are where real strokes sit: a quadrilateral of any proportion lands near
 * 0.82, an ellipse near 0.50.
 */
interface Outline {
  readonly kind: 'rectangle' | 'ellipse' | 'diamond';
  readonly boxFill: number;
  readonly cornerShare: number;
  readonly spreadProduct: number;
}

const OUTLINES: readonly Outline[] = [
  { kind: 'rectangle', boxFill: 1, cornerShare: 0.82, spreadProduct: 1.83 },
  { kind: 'diamond', boxFill: 0.5, cornerShare: 0.82, spreadProduct: 3.24 },
  { kind: 'ellipse', boxFill: Math.PI / 4, cornerShare: 0.5, spreadProduct: 2.25 },
];

/**
 * How much slack each measurement gets, which is also how the three are
 * weighed against each other once distance is expressed in units of them.
 *
 * `boxFill` is loose because it no longer has to separate a rectangle from an
 * ellipse on its own — `cornerShare` does that — which leaves it free to let a
 * tapered, hand-drawn quadrilateral through.
 */
const BOX_FILL_TOLERANCE = 0.2;
const CORNER_SHARE_TOLERANCE = 0.2;
const SPREAD_PRODUCT_TOLERANCE = 0.7;

/** The outline the stroke sits closest to, or null when none is close enough. */
function nearestOutline(features: StrokeFeatures): Outline['kind'] | null {
  let nearest: Outline['kind'] | null = null;
  let shortest = MAX_OUTLINE_DISTANCE;

  for (const outline of OUTLINES) {
    const distance = Math.hypot(
      (features.boxFill - outline.boxFill) / BOX_FILL_TOLERANCE,
      (features.cornerShare - outline.cornerShare) / CORNER_SHARE_TOLERANCE,
      (features.spreadProduct - outline.spreadProduct) / SPREAD_PRODUCT_TOLERANCE,
    );
    if (distance < shortest) {
      shortest = distance;
      nearest = outline.kind;
    }
  }

  return nearest;
}

/**
 * A stroke that never closed is a line or an arrow, provided it is straight.
 *
 * Both checks are needed. The spread test alone passes elbows and arcs, whose
 * points happen to sit in a thin enough cloud; the drift test alone passes a
 * stroke that doubled back along itself.
 */
function readStraightStroke(features: StrokeFeatures): 'line' | 'arrow' | null {
  if (features.axisSpreadRatio > STRAIGHT_MAX_SPREAD) return null;
  if (features.chordDrift > STRAIGHT_MAX_DRIFT) return null;
  return Math.abs(features.axisSkew) >= ARROW_MIN_SKEW ? 'arrow' : 'line';
}

function boundsOf(points: readonly Vec2[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Read a rough stroke as the shape it was meant to be, or null when it does
 * not resemble one closely enough to be worth replacing.
 *
 * `zoom` is the camera's, and only decides whether the stroke is big enough on
 * screen to be taken seriously.
 */
export function recogniseStroke(points: readonly Vec2[], zoom = 1): StrokeVerdict | null {
  if (points.length < 3) return null;

  const bounds = boundsOf(points);
  if (Math.max(bounds.width, bounds.height) * zoom < MIN_APPARENT_SIZE) return null;

  const features = strokeFeatures(points);

  if (features.closureGap > OPEN_STROKE_GAP) {
    const kind = readStraightStroke(features);
    if (!kind) return null;

    const from = points[0]!;
    // An arrow's last point is somewhere inside its head, not at its tip, so
    // it is read as pointing at the furthest the hand reached. A line has no
    // head, and ends where it stopped.
    const to = kind === 'arrow' ? farthestFrom(points, from) : points[points.length - 1]!;
    return { kind, from, to };
  }

  if (features.axisLopsidedness > MAX_LOPSIDEDNESS) return null;

  const kind = nearestOutline(features);
  return kind ? { kind, bounds } : null;
}
