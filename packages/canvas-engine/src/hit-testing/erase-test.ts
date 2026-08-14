import type { Segment } from '../geometry/segment.js';
import { segmentBounds, segmentsDistance } from '../geometry/segment.js';
import {
  shapeContainsPoint,
  shapeHasSolidInterior,
  shapeOutlineSegments,
} from '../shapes/outline.js';
import type { Shape } from '../shapes/shape.js';
import type { SpatialIndex } from '../spatial/spatial-index.js';

function eraseTolerance(shape: Shape, zoom: number): number {
  if (shape.kind === 'freehand') {
    return Math.max(2.25, 5 / zoom);
  }
  if (shape.kind === 'arrow' || shape.kind === 'line') {
    return Math.max(shape.strokeWidth, (shape.strokeWidth * 2) / zoom);
  }
  return Math.max(shape.strokeWidth / 2, 2 / zoom);
}

/**
 * Whether an eraser stroke segment should erase this shape.
 *
 * The segment matters rather than the pointer position: between two pointer
 * events the cursor can jump far enough to skip clean over a shape, and a
 * point test would miss it entirely.
 */
export function segmentErasesShape(segment: Segment, shape: Shape, zoom: number): boolean {
  const tolerance = eraseTolerance(shape, zoom);

  if (shapeHasSolidInterior(shape)) {
    const tip = segment[1];
    if (shapeContainsPoint(shape, tip[0], tip[1])) return true;
  }

  for (const outline of shapeOutlineSegments(shape)) {
    if (segmentsDistance(segment, outline) <= tolerance) return true;
  }

  return false;
}

/** Widest stroke the properties panel offers; the broad phase budgets for it. */
const MAX_EXPECTED_STROKE_WIDTH = 4;

/**
 * Upper bound on any shape's tolerance, computed without touching the shapes.
 *
 * The broad phase has to over-pad rather than measure each shape, or it would
 * scan the whole scene on every pointer move and the spatial index would buy
 * nothing.
 */
function broadPadding(zoom: number): number {
  return Math.max(2.25, 5 / zoom, (MAX_EXPECTED_STROKE_WIDTH * 2) / zoom);
}

/**
 * Ids of every shape the given eraser stroke segment touches.
 *
 * Broad phase uses the spatial index over the segment's padded bounds, so a
 * long stroke across a busy board still only runs exact geometry against the
 * handful of shapes nearby.
 */
export function shapesIntersectingSegment(
  shapes: readonly Shape[],
  index: SpatialIndex,
  segment: Segment,
  zoom: number,
): string[] {
  const candidates = new Set(index.searchRect(segmentBounds(segment, broadPadding(zoom))));
  if (candidates.size === 0) return [];

  const hits: string[] = [];
  for (const shape of shapes) {
    if (!candidates.has(shape.id)) continue;
    if (segmentErasesShape(segment, shape, zoom)) hits.push(shape.id);
  }
  return hits;
}
