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
  /**
   * The frame this shape is standing in, if any.
   *
   * A back-reference rather than a child list on the frame, and coordinates
   * stay absolute either way. A frame is a region of the board that owns
   * whatever is standing in it, not a parent whose transform its contents are
   * expressed in — so every path that already exists (drag, resize, hit-test,
   * erase, export, the spatial index) keeps working unchanged on a shape that
   * happens to be in one, and membership is a single field recomputed from
   * geometry when something moves rather than a structure to keep in step.
   *
   * Absent and null both mean "loose on the board". Absent is what every shape
   * written before frames existed says, which is why there is no migration.
   */
  readonly frameId?: string | null;
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

// --- Frame shape ---

/**
 * A named region that owns the shapes standing in it.
 *
 * Unlike every other shape here, a frame is defined as much by what it does to
 * its neighbours as by what it draws: it moves and deletes as one object with
 * its members, and it crops them at its edge. What it draws is deliberately
 * plain — a border and a label — because a frame is scaffolding for the work
 * on the board rather than part of it.
 */
export interface FrameShape extends BaseShape {
  readonly kind: 'frame';
  readonly width: number;
  readonly height: number;
  /** Shown above the top-left corner. Blank falls back to a default label. */
  readonly name: string;
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
  | ImageShape
  | FrameShape;

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

export function isFrame(s: Shape): s is FrameShape {
  return s.kind === 'frame';
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled shape kind: ${JSON.stringify(value)}`);
}
