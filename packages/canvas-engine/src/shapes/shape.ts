export interface BaseShape {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly strokeColor: string;
  readonly fillColor: string | null;
  readonly strokeWidth: number;
  readonly seed: number;
}

export interface RectangleShape extends BaseShape {
  readonly kind: 'rectangle';
  readonly width: number;
  readonly height: number;
}

export interface EllipseShape extends BaseShape {
  readonly kind: 'ellipse';
  readonly width: number;
  readonly height: number;
}

export interface DiamondShape extends BaseShape {
  readonly kind: 'diamond';
  readonly width: number;
  readonly height: number;
}

// --- Linear shapes (defined by points, no closed area) ---

export interface LineShape extends BaseShape {
  readonly kind: 'line';
  readonly points: ReadonlyArray<readonly [number, number]>;
}

export interface ArrowShape extends BaseShape {
  readonly kind: 'arrow';
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly startArrowhead: 'none' | 'triangle';
  readonly endArrowhead: 'none' | 'triangle';
}

export interface FreehandShape extends BaseShape {
  readonly kind: 'freehand';
  /** Many short segments captured from pointer move events. */
  readonly points: ReadonlyArray<readonly [number, number]>;
}

// --- Text shape ---

export interface TextShape extends BaseShape {
  readonly kind: 'text';
  readonly text: string;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly textAlign: 'left' | 'center' | 'right';
}

// --- The union ---

export type Shape =
  | RectangleShape
  | EllipseShape
  | DiamondShape
  | LineShape
  | ArrowShape
  | FreehandShape
  | TextShape;

/** Type guards — use these in renderer code for exhaustiveness checks. */
export function isRectangle(s: Shape): s is RectangleShape {
  return s.kind === 'rectangle';
}

export function isEllipse(s: Shape): s is EllipseShape {
  return s.kind === 'ellipse';
}

export function isDiamond(s: Shape): s is DiamondShape {
  return s.kind === 'diamond';
}

export function isArrow(s: Shape): s is ArrowShape {
  return s.kind === 'arrow';
}

export function isFreehand(s: Shape): s is FreehandShape {
  return s.kind === 'freehand';
}

export function isText(s: Shape): s is TextShape {
  return s.kind === 'text';
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled shape kind: ${JSON.stringify(value)}`);
}
