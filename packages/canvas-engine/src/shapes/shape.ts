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

/**
 * The Shape union. Add new shape kinds here as they're implemented.
 * Currently: rectangle only. Sprint 2's later PRs add ellipse, line,
 * arrow, diamond, freehand, text.
 */

export type Shape = RectangleShape;

/** Type guards — use these in renderer code for exhaustiveness checks. */
export function isRectangle(s: Shape): s is RectangleShape {
  return s.kind === 'rectangle';
}
