import {
  createArrow,
  createDiamond,
  createEllipse,
  createFreehand,
  createLine,
  createRectangle,
  type Shape,
  type StrokeVerdict,
} from '@canvasflow/canvas-engine';
import type { ItemStyle } from './tool-machine.types';

/**
 * How much of the pending opacity a shape still being sketched is drawn at.
 *
 * Scaled rather than fixed, so a style already set to a light opacity is not
 * previewed brighter than the shape it is about to become.
 */
const PENDING_OPACITY = 0.7;

type Point = readonly [number, number];

/**
 * The stroke itself, as the shape it would be kept as if nothing is read from
 * it.
 *
 * Points are stored relative to the first one, which is what every other
 * linear shape here does — it keeps a stroke's origin at the stroke.
 */
export function sketchStroke(points: readonly Point[], id: string, style: ItemStyle): Shape {
  const [originX, originY] = points[0] ?? [0, 0];
  return createFreehand({
    id,
    x: originX,
    y: originY,
    points: points.map(([x, y]) => [x - originX, y - originY] as Point),
    ...style,
  });
}

/** The shape a read stroke becomes, in the style the next shape would be drawn in. */
export function sketchShape(verdict: StrokeVerdict, id: string, style: ItemStyle): Shape {
  switch (verdict.kind) {
    case 'rectangle':
      return createRectangle({ id, ...verdict.bounds, ...style });
    case 'ellipse':
      return createEllipse({ id, ...verdict.bounds, ...style });
    case 'diamond':
      return createDiamond({ id, ...verdict.bounds, ...style });
    case 'line':
    case 'arrow': {
      const [fromX, fromY] = verdict.from;
      const points: Point[] = [
        [0, 0],
        [verdict.to[0] - fromX, verdict.to[1] - fromY],
      ];
      return verdict.kind === 'arrow'
        ? createArrow({ id, x: fromX, y: fromY, points, ...style })
        : createLine({ id, x: fromX, y: fromY, points, ...style });
    }
  }
}

/**
 * What to draw while the stroke is still being made.
 *
 * Outlines are previewed as the shape they have been read as, because a stroke
 * only closes once and the reading holds from that moment. Straight strokes are
 * previewed as the raw stroke instead: almost every gesture passes through
 * looking straight on its way to being something else, so previewing that would
 * flicker a line under the hand for the first half of every rectangle. Nothing
 * is lost by waiting — the release reads the whole stroke again.
 */
export function sketchPreview(
  points: readonly Point[],
  verdict: StrokeVerdict | null,
  id: string,
  style: ItemStyle,
): Shape {
  const pending: ItemStyle = { ...style, opacity: style.opacity * PENDING_OPACITY };
  return verdict && verdict.kind !== 'line' && verdict.kind !== 'arrow'
    ? sketchShape(verdict, id, pending)
    : sketchStroke(points, id, pending);
}
