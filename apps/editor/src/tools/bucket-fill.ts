import {
  computeFillRegion,
  createLine,
  fillPolygonPoints,
  frameForShape,
  isFillPaint,
  isRestylableFill,
  lockedShapeIds,
  type FillPlacement,
  type FillStyle,
  type LineShape,
  type Shape,
} from '@canvasflow/canvas-engine';
import { joinableFrames } from '../lock/lock-ops';

/** The settings a pour is made with — the bucket's part of the item style. */
export interface BucketStyle {
  /** Never transparent: see `bucketFillColor`. */
  readonly fillColor: string;
  readonly fillStyle: FillStyle;
  readonly opacity: number;
}

/** What a click with the bucket comes to. */
export type BucketOutcome =
  /** A new fill, to go in beside the shape `placement` names. */
  | { readonly kind: 'create'; readonly shape: LineShape; readonly placement: FillPlacement }
  /** A fill already there, poured again with the current settings. */
  | { readonly kind: 'restyle'; readonly id: string; readonly patch: Partial<BucketStyle> }
  /** A message for the person clicking: no closed area here, or too much to work it out. */
  | { readonly kind: 'notice'; readonly reason: 'noRegion' | 'tooComplex' }
  /** Nothing to do — empty board, or a fill already exactly this. */
  | { readonly kind: 'none' };

/**
 * What the bucket does with a click at `point`.
 *
 * `shapes` is the board in layer order, bottom first, and `hit` the shape a
 * click there would pick up, if any — the one that is recoloured rather than
 * covered when it is a fill of the same area.
 */
export function planBucketFill(args: {
  readonly point: { readonly x: number; readonly y: number };
  readonly shapes: readonly Shape[];
  readonly hit: Shape | null;
  readonly style: BucketStyle;
  readonly id: string;
}): BucketOutcome {
  const { point, shapes, hit, style } = args;
  const result = computeFillRegion({ point: [point.x, point.y], shapes });

  if (!result.ok) {
    // No area here, but the click landed on paint — a fill whose outlines
    // have since been deleted, say. Recolouring it is plainly what was meant,
    // and beats a message.
    if (hit && isFillPaint(hit)) return restyle(hit, style);
    if (result.reason === 'too_complex') return { kind: 'notice', reason: 'tooComplex' };
    // Clicking open board says nothing: there is nothing there to have meant.
    if (result.reason === 'no_owner') return { kind: 'none' };
    return { kind: 'notice', reason: 'noRegion' };
  }

  // A second click on an area already filled recolours that fill rather than
  // stacking a copy on it.
  if (hit && isRestylableFill(hit, result.points)) return restyle(hit, style);

  const fill = createLine({
    id: args.id,
    ...fillPolygonPoints(result.points),
    strokeColor: 'transparent',
    fillColor: style.fillColor,
    fillStyle: style.fillStyle,
    opacity: style.opacity,
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    edges: 'sharp',
  });

  // Poured inside a frame is poured into it, as anything drawn there is.
  const frameId = frameForShape(fill, joinableFrames(shapes, lockedShapeIds(shapes)));
  const shape: LineShape = frameId ? { ...fill, frameId } : fill;
  return { kind: 'create', shape, placement: placementInFrame(result.placement, frameId, shapes) };
}

/**
 * The placement, lifted above the fill's own frame if it would land below it.
 * A frame paints over whatever of its members sits beneath it, so a member
 * always goes above — the fill only just, so it stays under everything else.
 */
function placementInFrame(
  placement: FillPlacement,
  frameId: string | null,
  shapes: readonly Shape[],
): FillPlacement {
  if (!frameId) return placement;
  const anchor = shapes.findIndex((shape) => shape.id === placement.shapeId);
  const frame = shapes.findIndex((shape) => shape.id === frameId);
  const below = placement.placement === 'below' ? anchor <= frame : anchor < frame;
  return below ? { placement: 'above', shapeId: frameId } : placement;
}

/** The fill a click landed on, or what it would take to make it this one. */
function restyle(hit: Shape, style: BucketStyle): BucketOutcome {
  const patch: Partial<BucketStyle> = {
    ...(hit.fillColor !== style.fillColor && { fillColor: style.fillColor }),
    ...(hit.fillStyle !== style.fillStyle && { fillStyle: style.fillStyle }),
    ...(hit.opacity !== style.opacity && { opacity: style.opacity }),
  };
  return Object.keys(patch).length > 0 ? { kind: 'restyle', id: hit.id, patch } : { kind: 'none' };
}
