import type { Arrowhead, ArrowType, Edges, FillStyle, Roughness, StrokeStyle } from './style.js';

export interface BaseShape {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly strokeColor: string;
  readonly fillColor: string | null;
  readonly fillStyle: FillStyle;
  readonly strokeWidth: number;
  readonly strokeStyle: StrokeStyle;
  readonly roughness: Roughness;
  /** 0–100. */
  readonly opacity: number;
  readonly seed: number;
  readonly lastEditedBy?: string;
  readonly lastEditedAt?: number;
}

export interface RectangleShape extends BaseShape {
  readonly kind: 'rectangle';
  readonly width: number;
  readonly height: number;
  readonly edges: Edges;
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
  readonly edges: Edges;
}

// --- Linear shapes (defined by points, no closed area) ---

export interface LineShape extends BaseShape {
  readonly kind: 'line';
  readonly points: ReadonlyArray<readonly [number, number]>;
  /** `round` curves through the points instead of joining them straight. */
  readonly edges: Edges;
}

export interface ArrowShape extends BaseShape {
  readonly kind: 'arrow';
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly startArrowhead: Arrowhead;
  readonly endArrowhead: Arrowhead;
  readonly arrowType: ArrowType;
}

export interface FreehandShape extends BaseShape {
  readonly kind: 'freehand';
  /** Many short segments captured from pointer move events. */
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly edges: Edges;
  /** Taper the stroke toward both ends, as if drawn with varying pressure. */
  readonly simulatePressure: boolean;
}

// --- Text shape ---

export interface TextShape extends BaseShape {
  readonly kind: 'text';
  readonly text: string;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly textAlign: 'left' | 'center' | 'right';
}

// --- Image shape ---

/**
 * Whether this image's bytes have reached storage every collaborator can read.
 *
 * Not a loading state — whether a peer has the bitmap decoded is a local
 * question, answered by the image cache. This is the one bit of *durability*
 * that has to cross the wire: a peer receiving a shape whose bytes are still
 * uploading would otherwise fetch a 404 and mark the image permanently broken.
 * The uploading client flips `pending` to `saved` once the upload lands, and
 * that flip is what tells everyone else the bytes are worth asking for.
 */
export type ImageStatus = 'pending' | 'saved' | 'error';

export interface ImageShape extends BaseShape {
  readonly kind: 'image';
  readonly width: number;
  readonly height: number;
  /**
   * Content hash of the original file, and the only reference to the bytes the
   * document carries. Keeping the pixels out of the shape is what stops one
   * photo from pushing a whole board past the snapshot size limit.
   */
  readonly fileId: string;
  readonly mimeType: string;
  readonly status: ImageStatus;
  /**
   * Source pixel dimensions. Denormalized onto the shape so a peer can lay out
   * the placeholder at the right aspect ratio before the bitmap has arrived —
   * and so a resize can stay proportional even if the fetch never succeeds.
   */
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

// --- The union ---

export type Shape =
  | RectangleShape
  | EllipseShape
  | DiamondShape
  | LineShape
  | ArrowShape
  | FreehandShape
  | TextShape
  | ImageShape;

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

export function isImage(s: Shape): s is ImageShape {
  return s.kind === 'image';
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled shape kind: ${JSON.stringify(value)}`);
}
