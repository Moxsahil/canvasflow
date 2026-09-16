import type { ArrowBinding, ArrowShape } from './shape.js';
import type { Rect } from '../math.js';
import { arrowLabelLayout } from './arrow-label.js';
import {
  ARROWHEAD_GEOMETRY,
  resolveBaseStyle,
  type Arrowhead,
  type ArrowType,
  type BaseStyleInput,
} from './style.js';
import { strokeWidthOf } from './shape.js';

/** How far the longest arrowhead reaches back from the point it sits on. */
const LONGEST_ARROWHEAD = Math.max(...Object.values(ARROWHEAD_GEOMETRY).map((g) => g.size));

/**
 * An arrow is a line with arrowhead markers at one or both ends.
 * Same point-relative geometry as Line.
 */
export function createArrow(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    points: ReadonlyArray<readonly [number, number]>;
    startArrowhead?: Arrowhead;
    endArrowhead?: Arrowhead;
    arrowType?: ArrowType;
    startBinding?: ArrowBinding | null;
    endBinding?: ArrowBinding | null;
    label?: string;
  },
): ArrowShape {
  if (input.points.length < 2) {
    throw new Error('Arrow requires at least 2 points');
  }
  return {
    kind: 'arrow',
    id: input.id,
    x: input.x,
    y: input.y,
    points: input.points,
    startArrowhead: input.startArrowhead ?? 'none',
    endArrowhead: input.endArrowhead ?? 'arrow',
    arrowType: input.arrowType ?? 'straight',
    startBinding: input.startBinding ?? null,
    endBinding: input.endBinding ?? null,
    label: input.label ?? '',
    ...resolveBaseStyle(input),
    // Arrows enclose no area.
    fillColor: null,
  };
}

/**
 * The box the arrow's line and arrowheads are drawn within.
 *
 * Kept apart from `arrowBounds` so a renderer can ask what the arrow itself
 * covers without the label it is about to cut a hole for.
 */
export function arrowGeometryBounds(s: ArrowShape): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of s.points) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  return {
    x: s.x + minX,
    y: s.y + minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Everywhere the arrow could put ink: its geometry, grown by the stroke it is
 * drawn with, the longest arrowhead it could carry and the wobble the
 * generator adds on top.
 *
 * Generous on purpose — its one job is to be the outer half of the even-odd
 * clip that breaks the line for a label, where covering too much costs nothing
 * and covering too little would clip the arrow itself.
 */
export function arrowInkBounds(s: ArrowShape): Rect {
  const overhang = strokeWidthOf(s) + LONGEST_ARROWHEAD + s.roughness * 2;
  const g = arrowGeometryBounds(s);
  return {
    x: g.x - overhang,
    y: g.y - overhang,
    width: g.width + overhang * 2,
    height: g.height + overhang * 2,
  };
}

export function arrowBounds(s: ArrowShape): Rect {
  const geometry = arrowGeometryBounds(s);
  const label = arrowLabelLayout(s);
  if (!label) return geometry;

  // A label on a shallow arrow stands taller than the line it interrupts, and
  // what is outside these bounds is outside the export, the zoom-to-fit and
  // what a click can reach.
  const x = Math.min(geometry.x, label.box.x);
  const y = Math.min(geometry.y, label.box.y);
  return {
    x,
    y,
    width: Math.max(geometry.x + geometry.width, label.box.x + label.box.width) - x,
    height: Math.max(geometry.y + geometry.height, label.box.y + label.box.height) - y,
  };
}
