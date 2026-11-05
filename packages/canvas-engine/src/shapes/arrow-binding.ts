import type { Point, Rect } from '../math.js';
import type { Segment } from '../geometry/segment.js';
import { fromShapeFrame, shapeBounds, shapeBox, toShapeFrame } from './bounds.js';
import { shapeExactOutline } from './outline.js';
import { shapeAngle } from './rotation.js';
import {
  ELBOW_PADDING,
  HEADING_DOWN,
  HEADING_LEFT,
  HEADING_RIGHT,
  HEADING_UP,
  routeElbow,
  type ElbowEnd,
  type Heading,
} from './elbow-route.js';
import {
  assertNever,
  isArrow,
  shapeScale,
  strokeWidthOf,
  type ArrowBinding,
  type ArrowShape,
  type Shape,
} from './shape.js';
import { ARROWHEAD_GEOMETRY, circleArrowheadRadius, type Arrowhead } from './style.js';

/**
 * How far past an arrow's end the head drawn there reaches.
 *
 * Every head but the circle has its tip on the end point and is drawn with
 * round joins, so it reaches half the stroke past it. A circle is centred on
 * the end point and reaches its radius, and half the stroke more when it is
 * only an outline. A bare end is drawn with a flat cap and reaches nothing.
 */
function headReach(arrow: ArrowShape, head: Arrowhead): number {
  if (head === 'none') return 0;
  const stroke = strokeWidthOf(arrow);
  if (head === 'circle' || head === 'circle_outline') {
    const length = ARROWHEAD_GEOMETRY[head].size * shapeScale(arrow);
    const radius = circleArrowheadRadius(length, stroke);
    return head === 'circle' ? radius : radius + stroke / 2;
  }
  return stroke / 2;
}

/**
 * How much of a shape's stroke lies outside its outline: half of it, for the
 * kinds drawn with one. Text and images have none, and a frame's border is a
 * hairline drawn the same width at every zoom.
 */
function strokeOutside(shape: Shape): number {
  switch (shape.kind) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      return strokeWidthOf(shape) / 2;
    default:
      return 0;
  }
}

/**
 * How far short of a bound shape's outline an arrow's end stops, in world
 * units: just far enough that what is drawn at that end meets the shape's
 * stroke, edge to edge — touching, with no gap between and no overlap.
 */
export function boundArrowGap(arrow: ArrowShape, head: Arrowhead, target: Shape): number {
  return strokeOutside(target) + headReach(arrow, head);
}

/**
 * The shortest a bound arrow is allowed to become.
 *
 * Two shapes close enough together leave less room between them than the gaps
 * want on both sides, and the arrow would turn inside out. It keeps this much
 * length in its original direction instead.
 */
const MIN_BOUND_ARROW_LENGTH = 8;

/** Which kinds an arrow will attach itself to. */
export function canBindTo(shape: Shape): boolean {
  switch (shape.kind) {
    // A closed shape has an inside to aim at and an outline to stop at. The
    // linear kinds have neither, and an arrow bound to another arrow is a knot
    // nobody asked for.
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'image':
    case 'embed':
    case 'bookmark':
    case 'text':
    case 'frame':
    case 'note':
      return true;
    case 'line':
    case 'arrow':
    case 'freehand':
      return false;
    // A topic is moved by its map's layout rather than by anyone dragging it,
    // and an end attached to it would be left behind every time it moved.
    case 'topic':
      return false;
    default:
      return assertNever(shape);
  }
}

/**
 * Where a point sits within a shape's box, as a fraction of it — of the box
 * as drawn before it was turned, so the spot turns with the shape.
 */
export function normalizedAnchorFor(shape: Shape, point: Point): { x: number; y: number } {
  const bounds = shapeBox(shape);
  const local = toShapeFrame(shape, point);
  return {
    x: bounds.width > 0 ? (local.x - bounds.x) / bounds.width : 0.5,
    y: bounds.height > 0 ? (local.y - bounds.y) / bounds.height : 0.5,
  };
}

/**
 * The world point a binding aims at: its anchor for a fixed binding, which is
 * where the end sits, and the middle of the shape for one that aims there.
 */
function aimPointFor(binding: ArrowBinding, target: Shape): Point {
  const bounds = shapeBox(target);
  const anchor = binding.precise ? binding.anchor : { x: 0.5, y: 0.5 };
  return fromShapeFrame(target, {
    x: bounds.x + clamp01(anchor.x) * bounds.width,
    y: bounds.y + clamp01(anchor.y) * bounds.height,
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/**
 * Where a segment first crosses a shape's outline on its way in.
 *
 * Returns null when it never does — the two ends are both inside the shape, or
 * both outside and past it — and the caller keeps aiming where it was.
 */
export function outlineCrossing(target: Shape, from: Point, to: Point): Point | null {
  const segment: Segment = [
    [from.x, from.y],
    [to.x, to.y],
  ];

  let nearest: Point | null = null;
  let nearestDistanceSq = Infinity;

  for (const edge of outlineEdges(target)) {
    const hit = segmentCrossing(segment, edge);
    if (!hit) continue;

    const distanceSq = (hit.x - from.x) ** 2 + (hit.y - from.y) ** 2;
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearest = hit;
    }
  }

  return nearest;
}

/**
 * The outline an arrow lands on, as segments: the shape exactly as drawn, so
 * an end attached at a rounded corner meets the curve, not the box around it.
 */
function outlineEdges(target: Shape): Segment[] {
  const points = shapeExactOutline(target) ?? [];
  return points.map((point, i): Segment => [point, points[(i + 1) % points.length]!]);
}

/** The point on a shape's outline nearest to `point`, and how far that is. */
function nearestOnOutline(target: Shape, point: Point): { at: Point; distance: number } | null {
  let best: { at: Point; distance: number } | null = null;
  for (const [[ax, ay], [bx, by]] of outlineEdges(target)) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / lengthSq));
    const at = { x: ax + t * dx, y: ay + t * dy };
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (!best || distance < best.distance) best = { at, distance };
  }
  return best;
}

/** Whether a point lies inside a shape's outline as drawn. */
function insideOutline(target: Shape, point: Point): boolean {
  const points = shapeExactOutline(target) ?? [];
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A binding for an end let go at `point` over `target`, fixed at the spot of
 * the outline it was let go at.
 *
 * On or near the outline — outside it, or within `reach` of it inside — that
 * is the nearest point of the outline, so the end can be attached anywhere
 * along it: at a corner, at the middle of a side, or anywhere between.
 *
 * Further inside, the end is taken to be aimed at where it was let go: it
 * attaches where the line from the other end, `from`, to that point first
 * meets the outline — the side the arrow comes in by — and at the nearest
 * point of the outline when that line never meets it.
 */
export function bindingAt(target: Shape, point: Point, from: Point, reach: number): ArrowBinding {
  const nearest = nearestOnOutline(target, point);
  let spot = nearest?.at ?? point;
  if (nearest && nearest.distance > reach && insideOutline(target, point)) {
    spot = outlineCrossing(target, from, point) ?? nearest.at;
  }
  return { shapeId: target.id, anchor: normalizedAnchorFor(target, spot), precise: true };
}

/** The point two segments meet at, or null if they miss or are parallel. */
function segmentCrossing(a: Segment, b: Segment): Point | null {
  const [[ax1, ay1], [ax2, ay2]] = a;
  const [[bx1, by1], [bx2, by2]] = b;

  const dxA = ax2 - ax1;
  const dyA = ay2 - ay1;
  const dxB = bx2 - bx1;
  const dyB = by2 - by1;

  const denominator = dxA * dyB - dyA * dxB;
  if (denominator === 0) return null;

  const t = ((bx1 - ax1) * dyB - (by1 - ay1) * dxB) / denominator;
  const u = ((bx1 - ax1) * dyA - (by1 - ay1) * dxA) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return { x: ax1 + t * dxA, y: ay1 + t * dyA };
}

/** Pull a point back along a line towards `from` by `distance`. */
function backOff(from: Point, at: Point, distance: number): Point {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return at;
  const scale = Math.max(0, length - distance) / length;
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

/** One of an arrow's stored points, on the board. */
function absolutePoint(arrow: ArrowShape, index: number): Point {
  const [x, y] = arrow.points[index] ?? [0, 0];
  return { x: arrow.x + x, y: arrow.y + y };
}

/** The world endpoints an arrow's stored points describe. */
function storedTerminals(arrow: ArrowShape): { start: Point; end: Point } {
  const first = arrow.points[0] ?? [0, 0];
  const last = arrow.points[arrow.points.length - 1] ?? [0, 0];
  return {
    start: { x: arrow.x + first[0], y: arrow.y + first[1] },
    end: { x: arrow.x + last[0], y: arrow.y + last[1] },
  };
}

function boundTarget(
  binding: ArrowBinding | null,
  shapesById: ReadonlyMap<string, Shape>,
): Shape | null {
  if (!binding) return null;
  // A binding can outlive its target — a collaborator deleting the shape, an
  // undo landing out of order — and the arrow simply falls back to its points
  // rather than throwing on the render path.
  const target = shapesById.get(binding.shapeId);
  return target && canBindTo(target) ? target : null;
}

/**
 * Where an arrow's ends actually are, given whatever it is attached to.
 *
 * A fixed binding holds its end on its anchor, the spot on the shape it was
 * attached at, and the end goes wherever that spot goes — the line pivots
 * about it rather than sliding round to whichever edge faces the other end.
 *
 * A binding that aims at the middle of its shape, as every one did before
 * bindings were fixed, aims first and then stops: the line is drawn between
 * the two aim points, and the end is pulled back to where that line crosses
 * the shape. The editor pins those where they stand — see `withPinnedBindings`.
 *
 * Either way the end then stops short by the gap, so what is drawn there meets
 * the shape's edge.
 */
export function resolveArrowTerminals(
  arrow: ArrowShape,
  shapesById: ReadonlyMap<string, Shape>,
): { start: Point; end: Point } {
  const stored = storedTerminals(arrow);

  const startTarget = boundTarget(arrow.startBinding, shapesById);
  const endTarget = boundTarget(arrow.endBinding, shapesById);
  if (!startTarget && !endTarget) return stored;

  // An arrow with both ends on the same shape has no line to speak of, so
  // there is nothing to intersect and nowhere sensible to put it. Left where
  // the person drew it.
  if (startTarget && endTarget && startTarget.id === endTarget.id) return stored;

  const startAim = startTarget ? aimPointFor(arrow.startBinding!, startTarget) : stored.start;
  const endAim = endTarget ? aimPointFor(arrow.endBinding!, endTarget) : stored.end;

  if (startAim.x === endAim.x && startAim.y === endAim.y) return stored;

  let start = startAim;
  let end = endAim;

  // A fixed end with a bend before it stops short along its own last run, not
  // along the line to the far end, which would knock a right-angled route off
  // the square.
  const bends = arrow.points.length > 2;
  const beforeEnd = bends ? absolutePoint(arrow, arrow.points.length - 2) : startAim;
  const afterStart = bends ? absolutePoint(arrow, 1) : endAim;

  if (endTarget) {
    const gap = boundArrowGap(arrow, arrow.endArrowhead, endTarget);
    const precise = arrow.endBinding!.precise;
    const meets = precise ? endAim : outlineCrossing(endTarget, startAim, endAim);
    if (meets) end = backOff(precise ? beforeEnd : startAim, meets, gap);
  }
  if (startTarget) {
    const gap = boundArrowGap(arrow, arrow.startArrowhead, startTarget);
    const precise = arrow.startBinding!.precise;
    const meets = precise ? startAim : outlineCrossing(startTarget, endAim, startAim);
    if (meets) start = backOff(precise ? afterStart : endAim, meets, gap);
  }

  return keepApart(start, end, startAim, endAim);
}

/**
 * Two shapes closer together than the gaps want leave the ends crossed over.
 * Rather than draw a backwards arrow, fall back to a short one pointing the way
 * the aim points do.
 */
function keepApart(start: Point, end: Point, startAim: Point, endAim: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  const aimDx = endAim.x - startAim.x;
  const aimDy = endAim.y - startAim.y;
  const aimLength = Math.hypot(aimDx, aimDy);

  const flipped = dx * aimDx + dy * aimDy < 0;
  if (!flipped && length >= MIN_BOUND_ARROW_LENGTH) return { start, end };
  if (aimLength === 0) return { start, end };

  const midX = (startAim.x + endAim.x) / 2;
  const midY = (startAim.y + endAim.y) / 2;
  const halfX = (aimDx / aimLength) * (MIN_BOUND_ARROW_LENGTH / 2);
  const halfY = (aimDy / aimLength) * (MIN_BOUND_ARROW_LENGTH / 2);

  return {
    start: { x: midX - halfX, y: midY - halfY },
    end: { x: midX + halfX, y: midY + halfY },
  };
}

/**
 * The arrow with each end that aims at the middle of its shape fixed instead,
 * to the spot where it meets that shape now — so nothing moves on screen, and
 * from here on the end stays on that spot of the shape wherever it goes.
 *
 * How a binding made by attaching an end is finished: the end is first aimed
 * at the middle, which finds the edge facing the other end, and is fixed
 * there. The same turns a board's older bindings, which all aim at the
 * middle, into fixed ones. An end whose line never crosses its shape — the
 * other end is inside it — is fixed where it stands.
 *
 * Returns the very arrow it was given when no end needed fixing.
 */
export function withPinnedBindings(
  arrow: ArrowShape,
  shapesById: ReadonlyMap<string, Shape>,
): ArrowShape {
  const startTarget = boundTarget(arrow.startBinding, shapesById);
  const endTarget = boundTarget(arrow.endBinding, shapesById);
  const pinStart = startTarget !== null && !arrow.startBinding!.precise;
  const pinEnd = endTarget !== null && !arrow.endBinding!.precise;
  if (!pinStart && !pinEnd) return arrow;
  // Both ends on one shape is left as drawn by `resolveArrowTerminals`.
  if (startTarget && endTarget && startTarget.id === endTarget.id) return arrow;

  const stored = storedTerminals(arrow);
  const startAim = startTarget ? aimPointFor(arrow.startBinding!, startTarget) : stored.start;
  const endAim = endTarget ? aimPointFor(arrow.endBinding!, endTarget) : stored.end;

  let { startBinding, endBinding } = arrow;
  if (pinEnd) {
    const meets = outlineCrossing(endTarget!, startAim, endAim) ?? stored.end;
    endBinding = {
      ...arrow.endBinding!,
      anchor: normalizedAnchorFor(endTarget!, meets),
      precise: true,
    };
  }
  if (pinStart) {
    const meets = outlineCrossing(startTarget!, endAim, startAim) ?? stored.start;
    startBinding = {
      ...arrow.startBinding!,
      anchor: normalizedAnchorFor(startTarget!, meets),
      precise: true,
    };
  }
  return { ...arrow, startBinding, endBinding };
}

/**
 * The spot on its shape a fixed binding holds its end to, in world space. Null
 * for a binding that aims at the middle, which has no one spot, and for one
 * whose shape is gone.
 */
export function bindingPointOf(
  binding: ArrowBinding | null,
  shapesById: ReadonlyMap<string, Shape>,
): Point | null {
  if (!binding?.precise) return null;
  const target = boundTarget(binding, shapesById);
  return target ? aimPointFor(binding, target) : null;
}

/** Whether an arrow is attached to any of these shapes. */
export function arrowIsBoundTo(arrow: ArrowShape, shapeIds: ReadonlySet<string>): boolean {
  return (
    (arrow.startBinding !== null && shapeIds.has(arrow.startBinding.shapeId)) ||
    (arrow.endBinding !== null && shapeIds.has(arrow.endBinding.shapeId))
  );
}

/**
 * The arrows a gesture over these shapes has to redraw.
 *
 * An arrow qualifies by being attached to something that moved, or by being one
 * of the things that moved — dragging a bound arrow moves its stored points,
 * and they have to be put back where its attachments say they belong.
 *
 * Only two-point arrows take part, and elbow arrows, which are routed rather
 * than bent by hand. Any other arrow with a bend in it is a shape the person
 * routed by hand, and rewriting its ends would throw that away.
 */
export function arrowsAffectedBy(
  shapes: readonly Shape[],
  changedIds: ReadonlySet<string>,
): ArrowShape[] {
  const affected: ArrowShape[] = [];
  for (const shape of shapes) {
    if (!isArrow(shape)) continue;
    // An elbow arrow's bends are its route, worked out afresh whenever its
    // ends move, so it takes part however many it has.
    if (shape.points.length !== 2 && shape.arrowType !== 'elbow') continue;
    if (!shape.startBinding && !shape.endBinding) continue;
    if (arrowIsBoundTo(shape, changedIds) || changedIds.has(shape.id)) {
      affected.push(shape);
    }
  }
  return affected;
}

/** An arrow's stored geometry, rewritten to match where its ends now belong. */
export interface ArrowGeometryPatch {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly points: ReadonlyArray<readonly [number, number]>;
  /** Set when an elbow arrow shaped by hand had to be routed afresh. */
  readonly routeFixed?: boolean;
}

/**
 * The rewrites needed to put a set of arrows back on their shapes.
 *
 * Arrows already in the right place are left out, so a gesture that changes
 * nothing writes nothing — which matters on a shared board, where every write
 * is a message to everyone else looking at it.
 */
export function boundArrowPatches(
  arrows: readonly ArrowShape[],
  shapesById: ReadonlyMap<string, Shape>,
): ArrowGeometryPatch[] {
  const patches: ArrowGeometryPatch[] = [];

  for (const arrow of arrows) {
    if (arrow.arrowType === 'elbow') {
      const routed = arrow.routeFixed
        ? withFixedRouteEnds(arrow, shapesById)
        : withElbowRoute(arrow, shapesById);
      if (!sameRoute(arrow, routed) || Boolean(routed.routeFixed) !== Boolean(arrow.routeFixed)) {
        patches.push({
          id: arrow.id,
          x: routed.x,
          y: routed.y,
          points: routed.points,
          ...(routed.routeFixed !== arrow.routeFixed && { routeFixed: Boolean(routed.routeFixed) }),
        });
      }
      continue;
    }
    const { start, end } = resolveArrowTerminals(arrow, shapesById);
    const current = storedTerminals(arrow);
    if (samePoint(current.start, start) && samePoint(current.end, end)) continue;

    const bends = keptBends(arrow, current, start, end);
    patches.push({
      id: arrow.id,
      x: start.x,
      y: start.y,
      points: [start, ...bends, end].map(
        (point) => [point.x - start.x, point.y - start.y] as const,
      ),
    });
  }

  return patches;
}

/**
 * An arrow's bends, carried along when its ends move.
 *
 * They stay where they are, except that a run from an end that was level or
 * upright stays level or upright: the bend next to that end slides with it.
 * That is what keeps a right-angled route right-angled while the shapes at
 * either end are dragged about.
 */
function keptBends(
  arrow: ArrowShape,
  was: { start: Point; end: Point },
  start: Point,
  end: Point,
): Point[] {
  const bends: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < arrow.points.length - 1; i++) bends.push({ ...absolutePoint(arrow, i) });
  if (bends.length === 0) return bends;

  const level = (a: Point, b: Point) => Math.abs(a.y - b.y) < 0.5;
  const upright = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.5;

  const first = bends[0]!;
  if (level(was.start, first)) first.y = start.y;
  else if (upright(was.start, first)) first.x = start.x;

  const last = bends[bends.length - 1]!;
  if (level(was.end, last)) last.y = end.y;
  else if (upright(was.end, last)) last.x = end.x;

  return bends;
}

/** Half a thousandth of a unit apart is the same place, and not worth a write. */
function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.0005 && Math.abs(a.y - b.y) < 0.0005;
}

/**
 * The same arrow with any attachment to these shapes let go.
 *
 * Returns null when nothing was attached to them, so a caller can skip the
 * write. The points are left alone: they were kept true all along, so an arrow
 * whose shape is deleted simply stays where it was last drawn rather than
 * springing back to wherever it was first put.
 */
export function withBindingsCleared(
  arrow: ArrowShape,
  shapeIds: ReadonlySet<string>,
): ArrowShape | null {
  const dropStart = arrow.startBinding !== null && shapeIds.has(arrow.startBinding.shapeId);
  const dropEnd = arrow.endBinding !== null && shapeIds.has(arrow.endBinding.shapeId);
  if (!dropStart && !dropEnd) return null;

  return {
    ...arrow,
    startBinding: dropStart ? null : arrow.startBinding,
    endBinding: dropEnd ? null : arrow.endBinding,
  };
}

/**
 * The shape an arrow end dropped here should attach to, if any.
 *
 * Topmost first, so the answer matches what the person sees under the pointer.
 * The margin lets an end that stopped just short of an edge still count, which
 * is most of them — people aim at a shape, not at its outline.
 */
export function bindingTargetAt(
  shapes: readonly Shape[],
  point: Point,
  margin: number,
  excludeId?: string,
): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const shape = shapes[i]!;
    if (shape.id === excludeId || !canBindTo(shape)) continue;

    const bounds = shapeBounds(shape);
    if (
      point.x >= bounds.x - margin &&
      point.x <= bounds.x + bounds.width + margin &&
      point.y >= bounds.y - margin &&
      point.y <= bounds.y + bounds.height + margin
    ) {
      return shape;
    }
  }
  return null;
}

/** A binding onto `target` for an end dropped at `point`. */
export function bindingFor(target: Shape, point: Point, precise = false): ArrowBinding {
  return { shapeId: target.id, anchor: normalizedAnchorFor(target, point), precise };
}

// --- Elbow arrows -----------------------------------------------------------

/** Whether two arrows are drawn through the same points. */
function sameRoute(a: ArrowShape, b: ArrowShape): boolean {
  if (a.points.length !== b.points.length) return false;
  return a.points.every((point, i) =>
    samePoint(
      { x: a.x + point[0], y: a.y + point[1] },
      { x: b.x + b.points[i]![0], y: b.y + b.points[i]![1] },
    ),
  );
}

/** The four sides of a box as headings out of it, keyed the way anchors measure them. */
const SIDE_HEADINGS: ReadonlyArray<readonly [Heading, (u: number, v: number) => number]> = [
  [HEADING_LEFT, (u) => u],
  [HEADING_RIGHT, (u) => 1 - u],
  [HEADING_UP, (_u, v) => v],
  [HEADING_DOWN, (_u, v) => 1 - v],
];

/** The side of its box a spot, as a fraction of the box, is nearest. */
function nearestSide(u: number, v: number): Heading {
  let best = SIDE_HEADINGS[0]!;
  for (const side of SIDE_HEADINGS) if (side[1](u, v) < best[1](u, v)) best = side;
  return best[0];
}

/** A heading out of a shape's upright frame, turned with the shape and squared to the board. */
function turnedHeading(heading: Heading, angle: number): Heading {
  if (angle === 0) return heading;
  const x = heading.x * Math.cos(angle) - heading.y * Math.sin(angle);
  const y = heading.x * Math.sin(angle) + heading.y * Math.cos(angle);
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? HEADING_LEFT : HEADING_RIGHT;
  return y < 0 ? HEADING_UP : HEADING_DOWN;
}

/** The middle of each side, as the fraction of the box an anchor is kept in. */
function sideMiddle(heading: Heading): { x: number; y: number } {
  return { x: 0.5 + heading.x / 2, y: 0.5 + heading.y / 2 };
}

/**
 * A binding for an elbow arrow's end let go at `point` over `target`: at the
 * middle of one of its sides, which is where an elbow line comes in square.
 *
 * Let go near a side, it is that side. Let go well inside the shape, it is the
 * side facing `from` — where the other end is — so the line comes in the way
 * it was already heading.
 */
export function elbowBindingAt(
  target: Shape,
  point: Point,
  from: Point,
  reach: number,
): ArrowBinding {
  const box = shapeBox(target);
  const local = toShapeFrame(target, point);
  const u = box.width > 0 ? (local.x - box.x) / box.width : 0.5;
  const v = box.height > 0 ? (local.y - box.y) / box.height : 0.5;
  const nearEdge =
    local.x - box.x <= reach ||
    box.x + box.width - local.x <= reach ||
    local.y - box.y <= reach ||
    box.y + box.height - local.y <= reach ||
    u < 0 ||
    u > 1 ||
    v < 0 ||
    v > 1;

  let side: Heading;
  if (nearEdge) {
    side = nearestSide(u, v);
  } else {
    const towards = toShapeFrame(target, from);
    const dx = (towards.x - (box.x + box.width / 2)) / Math.max(box.width, 1);
    const dy = (towards.y - (box.y + box.height / 2)) / Math.max(box.height, 1);
    side =
      Math.abs(dx) >= Math.abs(dy)
        ? dx < 0
          ? HEADING_LEFT
          : HEADING_RIGHT
        : dy < 0
          ? HEADING_UP
          : HEADING_DOWN;
  }
  return { shapeId: target.id, anchor: sideMiddle(side), precise: true };
}

/** One end of an elbow arrow, as the router takes it. */
function elbowEndOf(
  arrow: ArrowShape,
  binding: ArrowBinding | null,
  head: Arrowhead,
  stored: Point,
  shapesById: ReadonlyMap<string, Shape>,
): ElbowEnd {
  const target = boundTarget(binding, shapesById);
  if (!target || !binding) return { point: stored, outward: null, box: null };
  // A binding that aims at the middle has no side of its own; the board pins
  // those where they meet the shape as it opens, so this is only a stopgap.
  const anchor = binding.precise ? binding.anchor : { x: 0.5, y: 0.5 };
  const side = nearestSide(anchor.x, anchor.y);
  const outward = turnedHeading(side, shapeAngle(target));
  const aim = aimPointFor(
    { ...binding, anchor: binding.precise ? anchor : sideMiddle(side), precise: true },
    target,
  );
  // Stopped short by the gap, so the head drawn there meets the shape's edge.
  const gap = boundArrowGap(arrow, head, target);
  return {
    point: { x: aim.x + outward.x * gap, y: aim.y + outward.y * gap },
    outward,
    box: shapeBounds(target),
  };
}

/** The kinds a route goes round rather than through. */
function isObstacle(shape: Shape): boolean {
  switch (shape.kind) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'text':
    case 'image':
    case 'embed':
    case 'bookmark':
    case 'note':
    case 'topic':
      return true;
    default:
      return false;
  }
}

/** How many shapes in the way a route takes account of, nearest first. */
const MAX_OBSTACLES = 24;

/**
 * The shapes in the way of a route between two points: the ones standing
 * near the box the two ends span, other than the shapes the arrow is attached
 * to and any shape an end is inside.
 */
function obstaclesBetween(
  start: Point,
  end: Point,
  shapesById: ReadonlyMap<string, Shape>,
  exclude: ReadonlySet<string>,
): Rect[] {
  const margin = ELBOW_PADDING * 6;
  const region = {
    x: Math.min(start.x, end.x) - margin,
    y: Math.min(start.y, end.y) - margin,
    right: Math.max(start.x, end.x) + margin,
    bottom: Math.max(start.y, end.y) + margin,
  };
  const centre = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const found: Array<{ box: Rect; distance: number }> = [];
  for (const shape of shapesById.values()) {
    if (exclude.has(shape.id) || shape.hidden || !isObstacle(shape)) continue;
    const box = shapeBounds(shape);
    if (
      box.x > region.right ||
      box.y > region.bottom ||
      box.x + box.width < region.x ||
      box.y + box.height < region.y
    ) {
      continue;
    }
    const holds = (p: Point) =>
      p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
    if (holds(start) || holds(end)) continue;
    const distance =
      Math.abs(box.x + box.width / 2 - centre.x) + Math.abs(box.y + box.height / 2 - centre.y);
    found.push({ box, distance });
  }
  found.sort((a, b) => a.distance - b.distance);
  return found.slice(0, MAX_OBSTACLES).map((each) => each.box);
}

/**
 * An elbow arrow routed afresh: out of the side its start is attached to, or
 * from where it starts, in level and upright runs round whatever is in the
 * way, and into the side its end is attached to, or to where it ends.
 *
 * Its first and last points say where a free end is; everything between is
 * the route, and is rewritten.
 */
export function withElbowRoute(
  arrow: ArrowShape,
  shapesById: ReadonlyMap<string, Shape>,
): ArrowShape {
  const stored = storedTerminals(arrow);
  const start = elbowEndOf(
    arrow,
    arrow.startBinding,
    arrow.startArrowhead,
    stored.start,
    shapesById,
  );
  const end = elbowEndOf(arrow, arrow.endBinding, arrow.endArrowhead, stored.end, shapesById);
  const exclude = new Set<string>([arrow.id]);
  if (arrow.startBinding) exclude.add(arrow.startBinding.shapeId);
  if (arrow.endBinding) exclude.add(arrow.endBinding.shapeId);
  const route = routeElbow(
    start,
    end,
    obstaclesBetween(start.point, end.point, shapesById, exclude),
  );
  const origin = route[0]!;
  return {
    ...arrow,
    x: origin.x,
    y: origin.y,
    points: route.map((point) => [point.x - origin.x, point.y - origin.y] as const),
    // Routed for it, so no longer shaped by hand.
    ...(arrow.routeFixed && { routeFixed: false }),
  };
}

/**
 * An elbow arrow shaped by hand, with its ends put back on what they are
 * attached to and everything between left where it was placed.
 *
 * The run at each end keeps its direction and only its length changes: the
 * bend beside an end slides with it, along the run, so every run stays square.
 * When an end has been carried round behind its own run — the run would now
 * have to go back into the shape it leaves — the hand-made route cannot be
 * kept, and the arrow is routed afresh.
 */
export function withFixedRouteEnds(
  arrow: ArrowShape,
  shapesById: ReadonlyMap<string, Shape>,
): ArrowShape {
  if (arrow.points.length < 4) return withElbowRoute(arrow, shapesById);
  const stored = storedTerminals(arrow);
  const start = elbowEndOf(
    arrow,
    arrow.startBinding,
    arrow.startArrowhead,
    stored.start,
    shapesById,
  );
  const end = elbowEndOf(arrow, arrow.endBinding, arrow.endArrowhead, stored.end, shapesById);

  const points = arrow.points.map(([px, py]) => ({ x: arrow.x + px, y: arrow.y + py }));
  const n = points.length;
  const level = (a: Point, b: Point) => Math.abs(a.y - b.y) <= Math.abs(a.x - b.x);

  const firstLevel = level(points[0]!, points[1]!);
  const lastLevel = level(points[n - 1]!, points[n - 2]!);
  points[0] = start.point;
  points[n - 1] = end.point;
  if (firstLevel) points[1] = { ...points[1]!, y: start.point.y };
  else points[1] = { ...points[1]!, x: start.point.x };
  if (lastLevel) points[n - 2] = { ...points[n - 2]!, y: end.point.y };
  else points[n - 2] = { ...points[n - 2]!, x: end.point.x };

  // Each end run has to leave its shape the way the side faces, and be
  // running along the axis that side faces along.
  const leavesRight = (from: Point, to: Point, out: Heading | null, isLevel: boolean) =>
    !out ||
    ((out.x !== 0) === isLevel &&
      (to.x - from.x) * out.x + (to.y - from.y) * out.y >= ELBOW_PADDING / 2);
  if (
    !leavesRight(points[0]!, points[1]!, start.outward, firstLevel) ||
    !leavesRight(points[n - 1]!, points[n - 2]!, end.outward, lastLevel)
  ) {
    return withElbowRoute(arrow, shapesById);
  }

  const origin = points[0]!;
  return {
    ...arrow,
    x: origin.x,
    y: origin.y,
    points: points.map((point) => [point.x - origin.x, point.y - origin.y] as const),
  };
}

/**
 * Whether any run of an arrow passes over or along any of these boxes — what
 * says a shape has been moved into its way, or out of the way it went round.
 */
export function elbowRouteTouches(arrow: ArrowShape, boxes: readonly Rect[]): boolean {
  for (let i = 1; i < arrow.points.length; i += 1) {
    const [ax, ay] = arrow.points[i - 1]!;
    const [bx, by] = arrow.points[i]!;
    const left = arrow.x + Math.min(ax, bx);
    const right = arrow.x + Math.max(ax, bx);
    const top = arrow.y + Math.min(ay, by);
    const bottom = arrow.y + Math.max(ay, by);
    for (const box of boxes) {
      if (
        right >= box.x &&
        left <= box.x + box.width &&
        bottom >= box.y &&
        top <= box.y + box.height
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether an elbow arrow still has the two points it was stored with before
 * elbow arrows were routed, and so has never been routed: it was drawn as one
 * level run and one upright one, wherever that took it.
 */
export function isUnroutedElbow(arrow: ArrowShape): boolean {
  if (arrow.arrowType !== 'elbow' || arrow.points.length !== 2) return false;
  const [a, b] = arrow.points as [readonly [number, number], readonly [number, number]];
  return Math.abs(a[0] - b[0]) > 0.5 && Math.abs(a[1] - b[1]) > 0.5;
}
