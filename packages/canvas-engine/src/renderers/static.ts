import { isFrame, type FrameShape, type Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import { createRoughCanvas } from '../utils/rough.js';
import { clipToFrame, drawFrameLabel } from './draw-frame.js';
import { drawSceneShape, type SceneShapeContext } from './draw-shape.js';

export interface StaticSceneOptions extends SceneShapeContext {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly Shape[];
  /** Shapes the eraser has marked but not yet deleted; drawn faded. */
  readonly pendingErasureIds?: ReadonlySet<string>;
  /**
   * Frames whose name is being edited, so the painted label is left out.
   *
   * The editor puts a real input over the label while it is being renamed;
   * without this the drawn name shows through behind whatever is typed.
   */
  readonly hiddenFrameLabelIds?: ReadonlySet<string>;
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
    hiddenFrameLabelIds,
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

  const frames = new Map<string, FrameShape>();
  for (const shape of shapes) {
    if (isFrame(shape)) frames.set(shape.id, shape);
  }

  for (const shape of shapes) {
    // A member is cropped at its frame's edge — the thing that makes a frame a
    // frame rather than a drawn rectangle. Clipping per shape rather than
    // grouping members under one clip keeps the document's z-order the only
    // thing deciding what covers what.
    const frame = shape.frameId ? frames.get(shape.frameId) : undefined;
    if (frame) {
      ctx.save();
      clipToFrame(ctx, frame);
    }

    drawSceneShape(ctx, rc, shape, pendingErasureIds?.has(shape.id) ?? false, {
      images,
      darkMode,
    });

    if (frame) ctx.restore();
  }

  // Labels last: they sit above their frame's top edge, in space that belongs
  // to the board, so anything drawn near the top of a frame would otherwise
  // paint over the name of the frame holding it.
  const zoom = camera?.zoom ?? 1;
  for (const frame of frames.values()) {
    if (hiddenFrameLabelIds?.has(frame.id)) continue;
    drawFrameLabel(ctx, frame, zoom);
  }

  ctx.restore();
}
