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
  /**
   * How much wider this shape's stroke and taller its text are than the style
   * asked for.
   *
   * Written once, when the shape is made, from the zoom it was made at: a
   * stroke laid down at 25% stores 4 here and is drawn four times as wide, so
   * it reads on screen as the weight it would have had at 1:1. Nothing
   * recomputes it afterwards. The multiplier belongs to the shape from then
   * on, which is what lets a board look the same to someone whose preferences
   * differ from the ones it was drawn under.
   *
   * Held apart from `strokeWidth` and `fontSize` rather than multiplied into
   * them, so those two keep the value the panel offered and the panel can go
   * on showing which of its presets is the selected one.
   *
   * Absent means 1 — what every shape written before this existed says, which
   * is why there is no migration.
   */
  readonly scale?: number;
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

/**
 * One end of an arrow, attached to a shape rather than to a position.
 *
 * The anchor is stored as a fraction of the bound shape's box rather than as a
 * point, which is what lets the attachment survive that shape being resized as
 * well as moved: half way down the left edge stays half way down the left edge.
 */
export interface ArrowBinding {
  readonly shapeId: string;
  /** 0–1 within the bound shape's bounds; (0.5, 0.5) is its centre. */
  readonly anchor: { readonly x: number; readonly y: number };
  /**
   * Whether the anchor is where the arrow aims.
   *
   * False — the usual case — means the arrow aims at the middle of the shape
   * and stops at whichever edge it meets on the way in, so it re-aims itself as
   * the shape moves around it. True pins it to the anchor, for an arrow
   * deliberately placed at one spot.
   */
  readonly precise: boolean;
}

export interface ArrowShape extends BaseShape {
  readonly kind: 'arrow';
  /**
   * Where the arrow is, relative to its own origin.
   *
   * Kept true even for a bound end: the ends are recomputed and written back
   * whenever a shape one is attached to moves, so everything that reads an
   * arrow's geometry — its bounds, hit testing, export — keeps working from the
   * points alone and needs to know nothing about bindings.
   */
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly startArrowhead: Arrowhead;
  readonly endArrowhead: Arrowhead;
  readonly arrowType: ArrowType;
  readonly startBinding: ArrowBinding | null;
  readonly endBinding: ArrowBinding | null;
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

/**
 * A shape's scale, checked at every read rather than trusted.
 *
 * The value arrives from storage, from a board file and from other clients,
 * and everything downstream multiplies by it. A zero, a negative or a NaN here
 * would not draw a wrong stroke — it would erase the shape, or spread NaN
 * through its bounds into the spatial index and take out far more than the one
 * shape. Anything that is not a positive finite number reads as 1.
 */
export function shapeScale(shape: { readonly scale?: number }): number {
  const { scale } = shape;
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * The stroke width to draw, measure and hit-test with.
 *
 * Every reader of `strokeWidth` outside the properties panel wants this
 * instead: the panel is asking which preset the shape was given, and everyone
 * else is asking how wide the line actually is.
 */
export function strokeWidthOf(shape: BaseShape): number {
  return shape.strokeWidth * shapeScale(shape);
}

/** The font size to draw and measure with. `fontSize` is the chosen preset. */
export function fontSizeOf(shape: TextShape): number {
  return shape.fontSize * shapeScale(shape);
}

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
