import type { ArrowShape, LineShape, Shape } from './shape.js';

/**
 * What dragging a handle does.
 *
 * `vertex` moves the point it sits on. The other two sit between points and
 * make a new one there on the first drag; they differ only in when they are
 * shown — a `virtual` handle is always visible because the shape it bends is
 * already curved, while a `create` handle stays hidden until the pointer finds
 * it, so a straight line is not littered with dots it will never use.
 */
export type ShapeHandleType = 'vertex' | 'virtual' | 'create';

export interface ShapeHandle {
  /** Stable across a shape's edits, so a hovered handle stays hovered. */
  readonly id: string;
  readonly type: ShapeHandleType;
  /**
   * The point the handle edits: the one at this index for a `vertex` handle,
   * and the one the others insert there.
   */
  readonly index: number;
  /** World coordinates. */
  readonly x: number;
  readonly y: number;
}

/** Radius of the drawn circle, in screen pixels. */
export const HANDLE_RADIUS = 4;
/**
 * Radius of the area that grabs it, in screen pixels. Much larger than the
 * circle: a handle is aimed at rather than hit, and an endpoint that has to be
 * caught within four pixels is a fight.
 */
export const HANDLE_HIT_RADIUS = 12;

/**
 * Zoomed out past this, handles stop growing on screen and start shrinking
 * with the board — otherwise a line an inch long is buried under its own
 * endpoints.
 */
const MIN_HANDLE_SCALE = 0.25;

/** Screen radius of the circle drawn for a handle at this zoom, in world units. */
export function handleRadiusAt(zoom: number): number {
  return HANDLE_RADIUS / Math.max(zoom, MIN_HANDLE_SCALE);
}

/**
 * Whether a shape is edited through its own points rather than through a box
 * drawn around them.
 */
export function hasPointHandles(shape: Shape): shape is LineShape | ArrowShape {
  return shape.kind === 'line' || shape.kind === 'arrow';
}

/**
 * How a shape shows the handles between its points, or null when it shows
 * none: an elbow arrow is routed rather than drawn through its points, so a
 * midpoint taken from them would float off the line it belongs to.
 */
function midpointHandleType(shape: LineShape | ArrowShape): ShapeHandleType | null {
  if (shape.kind === 'arrow') {
    if (shape.arrowType === 'elbow') return null;
    if (shape.arrowType === 'curved') return 'virtual';
  }
  return 'create';
}

/** Every handle a shape offers, before any are dropped for being too close. */
export function shapeHandles(shape: Shape): ShapeHandle[] | null {
  if (!hasPointHandles(shape)) return null;

  const handles: ShapeHandle[] = shape.points.map(([px, py], index) => ({
    id: `v${index}`,
    type: 'vertex' as const,
    index,
    x: shape.x + px,
    y: shape.y + py,
  }));

  const midpoint = midpointHandleType(shape);
  if (!midpoint) return handles;

  for (let i = 0; i < shape.points.length - 1; i += 1) {
    const from = shape.points[i]!;
    const to = shape.points[i + 1]!;
    handles.push({
      id: `m${i}`,
      type: midpoint,
      index: i + 1,
      x: shape.x + (from[0] + to[0]) / 2,
      y: shape.y + (from[1] + to[1]) / 2,
    });
  }

  return handles;
}

/**
 * The handles worth showing at this zoom.
 *
 * A midpoint sitting under a vertex is dropped: on a short segment the two
 * overlap, and the one that makes a new point would take the drag meant for
 * the one that moves an existing one.
 */
export function visibleShapeHandles(shape: Shape, zoom: number): ShapeHandle[] | null {
  const handles = shapeHandles(shape);
  if (!handles) return null;

  const minDistance = (HANDLE_HIT_RADIUS / zoom) * 2;
  const vertices = handles.filter((handle) => handle.type === 'vertex');

  return handles.filter(
    (handle) =>
      handle.type === 'vertex' ||
      !vertices.some(
        (vertex) => Math.hypot(handle.x - vertex.x, handle.y - vertex.y) < minDistance,
      ),
  );
}

/**
 * The handle under a point, or null.
 *
 * Vertices are tested first so that where two handles overlap, the drag moves
 * the point that is already there rather than adding another one.
 */
export function shapeHandleAt(
  shape: Shape,
  x: number,
  y: number,
  zoom: number,
): ShapeHandle | null {
  const handles = visibleShapeHandles(shape, zoom);
  if (!handles) return null;

  const radius = HANDLE_HIT_RADIUS / zoom;
  const ordered = [
    ...handles.filter((handle) => handle.type === 'vertex'),
    ...handles.filter((handle) => handle.type !== 'vertex'),
  ];

  for (const handle of ordered) {
    if (Math.hypot(x - handle.x, y - handle.y) <= radius) return handle;
  }
  return null;
}

/**
 * The same shape with `points[0]` back at the origin.
 *
 * Everything else that writes a linear shape keeps that invariant — bound
 * arrows are rewritten from their start point — so an edit that broke it would
 * leave two conventions on the board at once.
 */
function normalized<S extends LineShape | ArrowShape>(
  shape: S,
  points: Array<readonly [number, number]>,
): S {
  const [ox, oy] = points[0] ?? [0, 0];
  return {
    ...shape,
    x: shape.x + ox,
    y: shape.y + oy,
    points: points.map(([px, py]) => [px - ox, py - oy] as const),
  };
}

/** The shape with the point at `index` moved to a world position. */
export function withHandlePointMoved<S extends LineShape | ArrowShape>(
  shape: S,
  index: number,
  x: number,
  y: number,
): S {
  const points = shape.points.map((point, i) =>
    i === index ? ([x - shape.x, y - shape.y] as const) : point,
  );
  return normalized(shape, points);
}

/** The shape with a new point inserted at `index`, at a world position. */
export function withHandlePointInserted<S extends LineShape | ArrowShape>(
  shape: S,
  index: number,
  x: number,
  y: number,
): S {
  const points = [...shape.points];
  points.splice(index, 0, [x - shape.x, y - shape.y] as const);
  return normalized(shape, points);
}
