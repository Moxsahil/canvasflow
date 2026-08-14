/** Shared visual style vocabulary. Every shape kind carries these. */

/** How a filled area is hatched. Only meaningful when `fillColor` is set. */
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

/** Hand-drawn jitter: 0 architect, 1 artist, 2 cartoonist. */
export type Roughness = 0 | 1 | 2;

/** Corner/joint treatment. Ellipses have no corners, so they omit this. */
export type Edges = 'sharp' | 'round';

export type ArrowType = 'straight' | 'curved' | 'elbow';

export type Arrowhead =
  | 'none'
  | 'arrow'
  | 'bar'
  | 'circle'
  | 'circle_outline'
  | 'triangle'
  | 'triangle_outline'
  | 'diamond'
  | 'diamond_outline';

export const ARROWHEAD_GEOMETRY: Record<
  Exclude<Arrowhead, 'none'>,
  { size: number; angle: number; lengthRatio: number }
> = {
  arrow: { size: 25, angle: 20, lengthRatio: 0.5 },
  bar: { size: 15, angle: 90, lengthRatio: 0.5 },
  circle: { size: 15, angle: 25, lengthRatio: 0.5 },
  circle_outline: { size: 15, angle: 25, lengthRatio: 0.5 },
  triangle: { size: 15, angle: 25, lengthRatio: 0.5 },
  triangle_outline: { size: 15, angle: 25, lengthRatio: 0.5 },
  diamond: { size: 12, angle: 25, lengthRatio: 0.25 },
  diamond_outline: { size: 12, angle: 25, lengthRatio: 0.25 },
};

export const DEFAULT_STROKE_COLOR = '#1e1e1e';

/** Style fields every factory accepts, all optional. */
export interface BaseStyleInput {
  strokeColor?: string;
  fillColor?: string | null;
  fillStyle?: FillStyle;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  roughness?: Roughness;
  /** 0–100. */
  opacity?: number;
  rotation?: number;
  seed?: number;
}

export interface ResolvedBaseStyle {
  rotation: number;
  strokeColor: string;
  fillColor: string | null;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: Roughness;
  opacity: number;
  seed: number;
}

/**
 * Fills in defaults for the style fields shared by every shape, so the
 * factories stay a list of their own geometry rather than nine repeated
 * `?? default` lines each.
 */
export function resolveBaseStyle(input: BaseStyleInput): ResolvedBaseStyle {
  return {
    rotation: input.rotation ?? 0,
    strokeColor: input.strokeColor ?? DEFAULT_STROKE_COLOR,
    fillColor: input.fillColor ?? null,
    fillStyle: input.fillStyle ?? 'hachure',
    strokeWidth: input.strokeWidth ?? 2,
    strokeStyle: input.strokeStyle ?? 'solid',
    roughness: input.roughness ?? 1,
    opacity: input.opacity ?? 100,
    seed: input.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
}
