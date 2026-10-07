import type { Point } from '../math.js';
import type { Segment } from '../geometry/segment.js';
import { shapeBounds } from './bounds.js';
import { shapeExactOutline } from './outline.js';
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
    case 'text':
    case 'frame':
      return true;
    case 'line':
    case 'arrow':
    case 'freehand':
      return false;
    default:
      return assertNever(shape);
  }
}

/** Where a point sits within a shape's box, as a fraction of it. */
export function normalizedAnchorFor(shape: Shape, point: Point): { x: number; y: number } {
  const bounds = shapeBounds(shape);
  return {
    x: bounds.width > 0 ? (point.x - bounds.x) / bounds.width : 0.5,
    y: bounds.height > 0 ? (point.y - bounds.y) / bounds.height : 0.5,
  };
}

/**
 * The world point a binding aims at: its anchor for a fixed binding, which is
 * where the end sits, and the middle of the shape for one that aims there.
 */
function aimPointFor(binding: ArrowBinding, target: Shape): Point {
  const bounds = shapeBounds(target);
  const anchor = binding.precise ? binding.anchor : { x: 0.5, y: 0.5 };
  return {
    x: bounds.x + clamp01(anchor.x) * bounds.width,
    y: bounds.y + clamp01(anchor.y) * bounds.height,
  };
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
function outlineCrossing(target: Shape, from: Point, to: Point): Point | null {
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

  if (endTarget) {
    const gap = boundArrowGap(arrow, arrow.endArrowhead, endTarget);
    const meets = arrow.endBinding!.precise ? endAim : outlineCrossing(endTarget, startAim, endAim);
    if (meets) end = backOff(startAim, meets, gap);
  }
  if (startTarget) {
    const gap = boundArrowGap(arrow, arrow.startArrowhead, startTarget);
    const meets = arrow.startBinding!.precise
      ? startAim
      : outlineCrossing(startTarget, endAim, startAim);
    if (meets) start = backOff(endAim, meets, gap);
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
 * Only two-point arrows take part. Anything with a bend in it is a shape the
 * person routed by hand, and rewriting its ends would throw that away.
 */
export function arrowsAffectedBy(
  shapes: readonly Shape[],
  changedIds: ReadonlySet<string>,
): ArrowShape[] {
  const affected: ArrowShape[] = [];
  for (const shape of shapes) {
    if (!isArrow(shape) || shape.points.length !== 2) continue;
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
    const { start, end } = resolveArrowTerminals(arrow, shapesById);
    const current = storedTerminals(arrow);
    if (samePoint(current.start, start) && samePoint(current.end, end)) continue;

    patches.push({
      id: arrow.id,
      x: start.x,
      y: start.y,
      points: [
        [0, 0],
        [end.x - start.x, end.y - start.y],
      ],
    });
  }

  return patches;
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
