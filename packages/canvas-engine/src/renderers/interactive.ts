import type { ArrowShape, LineShape, Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import { shapeBounds } from '../shapes/bounds.js';
import {
  handleRadiusAt,
  hasPointHandles,
  visibleShapeHandles,
  HANDLE_HIT_RADIUS,
  type ShapeHandle,
} from '../shapes/handles.js';
import {
  arrowheadMarks,
  createRoughGenerator,
  generateIndicatorDrawable,
  traceArrowheadMark,
  traceDrawable,
} from '../utils/rough.js';
import type { Point, Rect } from '../math.js';

/**
 * One line of evidence for a snap that is currently holding.
 *
 * `points` is a run of points that ended up sharing a coordinate: a line is
 * drawn through them with a cross on each, so it is visible both which edge
 * lined up and what it lined up with. `gap` is one measured span between two
 * shapes, drawn as a bar with end caps — even spacing is shown by drawing
 * every span that came out equal.
 */
export type SnapGuide =
  | { readonly kind: 'points'; readonly points: readonly Point[] }
  | {
      readonly kind: 'gap';
      readonly direction: 'horizontal' | 'vertical';
      readonly from: Point;
      readonly to: Point;
    };

export interface InteractiveSceneOptions {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly Shape[];
  readonly selectedIds: readonly string[];
  readonly marquee: Rect | null;
  readonly camera?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };

  readonly search?: {
    /** Every match currently on screen. */
    readonly rects: readonly Rect[];
    /** The match being navigated to; may be several rects if it wraps a line. */
    readonly focusedRects: readonly Rect[];
  };

  /** Alignment evidence for the gesture in progress; empty when nothing snaps. */
  readonly snapGuides?: readonly SnapGuide[];

  /**
   * The handle under the pointer, by id. Only the handles that make a new
   * point care: they stay hidden until they are found, so this is what reveals
   * one.
   */
  readonly hoveredHandleId?: string | null;
}

const HANDLE_SIZE = 8; // screen pixels
/**
 * Exported because chrome drawn in the DOM rather than on the canvas has to
 * match it — the frame rename box rings itself in this, and a second copy of
 * the value would drift the moment either was tuned.
 */
export const SELECTION_COLOR = '#6366f1';
const HANDLE_FILL = '#ffffff';

const SEARCH_MATCH_FILL = 'rgba(255, 226, 0, 0.4)';
const SEARCH_FOCUS_FILL = 'rgba(255, 124, 0, 0.45)';

/**
 * Deliberately not the selection colour: a guide says something different from
 * an outline — it is transient, it belongs to the gesture rather than to any
 * shape, and it has to be told apart from the selection it is drawn across.
 */
const SNAP_COLOR = '#f03e3e';
/** Arms of the cross marking each aligned point, in screen pixels. */
const SNAP_CROSS_SIZE = 3;
/** Half-length of the bars capping a measured gap, in screen pixels. */
const SNAP_CAP_SIZE = 4;

/** Tint filling the disc under a handle the pointer has found. */
const HANDLE_HOVER_FILL = 'rgba(99, 102, 241, 0.16)';

/**
 * Geometry only, so no canvas is behind it. Kept for the life of the module
 * because a generator carries the cache that makes redrawing the same outline
 * on every frame of a drag cheap.
 */
const indicatorSource = { generator: createRoughGenerator() };

export function renderInteractiveScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  _canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: InteractiveSceneOptions,
): void {
  const { width, height, shapes, selectedIds, marquee, camera, search, snapGuides } = opts;
  const hoveredHandleId = opts.hoveredHandleId ?? null;

  clearCanvas(ctx, width, height);

  ctx.save();
  if (camera) {
    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
  }

  const zoom = camera?.zoom ?? 1;

  // --- Search highlights — beneath the selection UI, so a selected shape's
  // outline and handles stay readable over a highlighted match ---
  if (search && (search.rects.length > 0 || search.focusedRects.length > 0)) {
    ctx.fillStyle = SEARCH_MATCH_FILL;
    for (const rect of search.rects) {
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    ctx.fillStyle = SEARCH_FOCUS_FILL;
    for (const rect of search.focusedRects) {
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  }

  // --- Selection outlines ---
  if (selectedIds.length > 0) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([]);
    ctx.fillStyle = HANDLE_FILL;

    const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id));

    // A box is the right outline for a shape that fills one. A line or an
    // arrow does not: most of the box it spans is empty, so a box around it
    // marks out mostly board, hides which of two crossing lines is selected,
    // and offers to resize something that is edited end by end instead. Those
    // are outlined along themselves.
    for (const shape of selectedShapes) {
      if (hasPointHandles(shape)) {
        strokeShapeIndicator(ctx, shape);
      } else {
        const b = shapeBounds(shape);
        const pad = 4 / zoom;
        ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
      }
    }

    // --- Handles — only when exactly one shape is selected ---
    if (selectedShapes.length === 1) {
      const only = selectedShapes[0]!;
      const pointHandles = visibleShapeHandles(only, zoom);
      if (pointHandles) {
        drawPointHandles(ctx, pointHandles, zoom, hoveredHandleId);
      } else {
        const b = shapeBounds(only);
        const pad = 4 / zoom;
        const outerBounds: Rect = {
          x: b.x - pad,
          y: b.y - pad,
          width: b.width + pad * 2,
          height: b.height + pad * 2,
        };
        drawHandles(ctx, outerBounds, zoom);
      }
    }
  }

  // --- Snap guides — over the selection, since they explain where it is about
  // to land and a guide hidden under an outline explains nothing ---
  if (snapGuides && snapGuides.length > 0) {
    ctx.strokeStyle = SNAP_COLOR;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([]);
    for (const guide of snapGuides) {
      if (guide.kind === 'points') {
        drawPointsGuide(ctx, guide.points, zoom);
      } else {
        drawGapGuide(ctx, guide.from, guide.to, guide.direction, zoom);
      }
    }
  }

  ctx.restore();

  // --- Marquee — drawn in screen space, no camera transform ---
  if (marquee) {
    ctx.save();
    if (camera) {
      ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
      ctx.scale(camera.zoom, camera.zoom);
    }

    ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);

    ctx.fillRect(marquee.x, marquee.y, marquee.width, marquee.height);
    ctx.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height);

    ctx.setLineDash([]);
    ctx.restore();
  }
}

/**
 * A run of points that share a coordinate: one line spanning the outermost two,
 * and a cross on each so a point that happens to fall mid-line still shows.
 */
function drawPointsGuide(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: readonly Point[],
  zoom: number,
): void {
  if (points.length === 0) return;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();

  const arm = SNAP_CROSS_SIZE / zoom;
  ctx.beginPath();
  for (const point of points) {
    ctx.moveTo(point.x - arm, point.y - arm);
    ctx.lineTo(point.x + arm, point.y + arm);
    ctx.moveTo(point.x + arm, point.y - arm);
    ctx.lineTo(point.x - arm, point.y + arm);
  }
  ctx.stroke();
}

/** One measured span, capped at both ends so its extent is unambiguous. */
function drawGapGuide(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  from: Point,
  to: Point,
  direction: 'horizontal' | 'vertical',
  zoom: number,
): void {
  const cap = SNAP_CAP_SIZE / zoom;

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);

  // The caps run across the span, so a horizontal gap is capped by vertical
  // strokes and the other way round.
  if (direction === 'horizontal') {
    ctx.moveTo(from.x, from.y - cap);
    ctx.lineTo(from.x, from.y + cap);
    ctx.moveTo(to.x, to.y - cap);
    ctx.lineTo(to.x, to.y + cap);
  } else {
    ctx.moveTo(from.x - cap, from.y);
    ctx.lineTo(from.x + cap, from.y);
    ctx.moveTo(to.x - cap, to.y);
    ctx.lineTo(to.x + cap, to.y);
  }
  ctx.stroke();
}

/**
 * A line or arrow outlined along itself, arrowheads included.
 *
 * Leaves the stroke settings the caller set in place, so the outline is the
 * same weight and colour as the boxes drawn around everything else.
 */
function strokeShapeIndicator(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: LineShape | ArrowShape,
): void {
  ctx.beginPath();
  traceDrawable(ctx, generateIndicatorDrawable(indicatorSource, shape));
  if (shape.kind === 'arrow') {
    for (const mark of arrowheadMarks(shape)) traceArrowheadMark(ctx, mark);
  }
  ctx.stroke();
}

/**
 * The points of a line or arrow, as discs to drag.
 *
 * Round rather than square, and the difference carries meaning: a square
 * handle resizes the box a shape sits in, a round one moves a single point of
 * it. The ones that would make a new point stay hidden until the pointer finds
 * them, so a two-point arrow reads as two ends rather than three.
 */
function drawPointHandles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  handles: readonly ShapeHandle[],
  zoom: number,
  hoveredHandleId: string | null,
): void {
  const radius = handleRadiusAt(zoom);
  const hoverRadius = HANDLE_HIT_RADIUS / zoom;

  for (const handle of handles) {
    const hovered = handle.id === hoveredHandleId;
    if (handle.type === 'create' && !hovered) continue;

    if (hovered) {
      ctx.fillStyle = HANDLE_HOVER_FILL;
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, hoverRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = HANDLE_FILL;
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawHandles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bounds: Rect,
  zoom: number,
): void {
  const s = HANDLE_SIZE / zoom; // Handle size in world coords
  const half = s / 2;

  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  const positions: Array<[number, number]> = [
    [bounds.x, bounds.y], // top-left
    [cx, bounds.y], // top-center
    [right, bounds.y], // top-right
    [right, cy], // middle-right
    [right, bottom], // bottom-right
    [cx, bottom], // bottom-center
    [bounds.x, bottom], // bottom-left
    [bounds.x, cy], // middle-left
  ];

  for (const [x, y] of positions) {
    ctx.fillRect(x - half, y - half, s, s);
    ctx.strokeRect(x - half, y - half, s, s);
  }
}
