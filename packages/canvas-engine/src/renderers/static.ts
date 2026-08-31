import { isFrame, type FrameShape, type Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import { createRoughCanvas } from '../utils/rough.js';
import { frameChain } from '../frames/membership.js';
import { clipToFrame, drawFrameLabel } from './draw-frame.js';
import { drawSceneShape, type SceneShapeContext } from './draw-shape.js';

export interface StaticSceneOptions extends SceneShapeContext {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly Shape[];
  /** Shapes the eraser has marked but not yet deleted; drawn faded. */
  readonly pendingErasureIds?: ReadonlySet<string>;
  /**
   * Frames whose name is open for editing.
   *
   * Two things follow from it. The painted label is left out, because the
   * editor puts a real input over it and the drawn name would otherwise show
   * through whatever is typed. And the frame's border is drawn in the
   * selection colour, so it is obvious which frame the open field belongs to.
   */
  readonly editingFrameIds?: ReadonlySet<string>;
  readonly camera?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  /**
   * Painted over the full canvas before any shape. The live editor leaves this
   * unset and lets the container's CSS paint the board colour, but an export
   * has no container — the pixels are the whole artifact, so the renderer has
   * to lay the background down itself (or not, for a transparent image).
   */
  readonly backgroundColor?: string | null;
}

/**
 * Paint all finished shapes to the static canvas.
 *
 * Per-shape painting lives in drawSceneShape, shared with the new-element
 * renderer, so exhaustiveness over shape kinds is checked in one place.
 */
export function renderStaticScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: StaticSceneOptions,
): void {
  const {
    width,
    height,
    shapes,
    camera,
    pendingErasureIds,
    editingFrameIds,
    backgroundColor,
    images,
    darkMode,
  } = opts;

  clearCanvas(ctx, width, height);

  // Before the camera transform, so it covers the canvas rather than a
  // camera-sized rectangle somewhere in world space.
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();

  if (camera) {
    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
  }

  const rc = createRoughCanvas(canvas);
  // A frame's border and label are sized in screen pixels, so both passes
  // below need the scale they are being drawn at.
  const zoom = camera?.zoom ?? 1;

  const frames = new Map<string, FrameShape>();
  for (const shape of shapes) {
    if (isFrame(shape)) frames.set(shape.id, shape);
  }

  for (const shape of shapes) {
    // A member is cropped at its frame's edge — the thing that makes a frame a
    // frame rather than a drawn rectangle. Clipping per shape rather than
    // grouping members under one clip keeps the document's z-order the only
    // thing deciding what covers what.
    //
    // The whole chain, not just the immediate frame: successive clips
    // intersect, so a shape in a nested frame is cropped by that frame and
    // again by everything holding it. Without this an inner frame hanging over
    // the edge of its parent would show its contents outside the parent.
    const chain = shape.frameId ? frameChain(shape, frames) : [];
    if (chain.length > 0) {
      ctx.save();
      for (const frame of chain) clipToFrame(ctx, frame);
    }

    drawSceneShape(ctx, rc, shape, pendingErasureIds?.has(shape.id) ?? false, {
      images,
      darkMode,
      zoom,
      editingFrameIds,
    });

    if (chain.length > 0) ctx.restore();
  }

  // Labels last: they sit above their frame's top edge, in space that belongs
  // to the board, so anything drawn near the top of a frame would otherwise
  // paint over the name of the frame holding it.
  for (const frame of frames.values()) {
    if (editingFrameIds?.has(frame.id)) continue;
    drawFrameLabel(ctx, frame, zoom);
  }

  ctx.restore();
}
