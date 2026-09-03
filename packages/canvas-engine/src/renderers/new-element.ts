import type { Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import { createRoughCanvas } from '../utils/rough.js';
import { drawSceneShape, type SceneShapeContext } from './draw-shape.js';

export interface NewElementSceneOptions extends SceneShapeContext {
  readonly width: number;
  readonly height: number;
  readonly newElement: Shape | null;
  /**
   * Shapes collaborators are drawing right now.
   *
   * They share this layer with our own preview because they have the same
   * lifetime: both are transient, both are replaced by the document's copy the
   * instant they are committed, and neither should ever reach the static layer
   * that gets cached.
   */
  readonly peerDrafts?: readonly Shape[];
  readonly camera?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}

export function renderNewElementScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: NewElementSceneOptions,
): void {
  const { width, height, newElement, peerDrafts, camera, images, darkMode } = opts;

  clearCanvas(ctx, width, height);

  const drafts = peerDrafts ?? [];
  if (!newElement && drafts.length === 0) return;

  ctx.save();

  if (camera) {
    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
  }

  const rough = createRoughCanvas(canvas);

  // Drawn exactly as our own preview is, with no ghosting or tint to mark them
  // as someone else's. The moment one commits it arrives through the document
  // and is drawn by the static layer instead — anything distinguishing the two
  // would show up as a flicker at that handover, on every shape.
  for (const draft of drafts) {
    drawSceneShape(ctx, rough, draft, false, { images, darkMode });
  }

  // Ours last, so it stays on top of a collaborator's while both are in flight.
  if (newElement) {
    drawSceneShape(ctx, rough, newElement, false, { images, darkMode });
  }

  ctx.restore();
}
