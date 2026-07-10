import type { Shape } from '../shapes/shape.js';
import { clearCanvas } from '../utils/canvas.js';
import { shapeBounds } from '../shapes/bounds.js';
import type { Rect } from '../math.js';

export interface InteractiveSceneOptions {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly Shape[];
  readonly selectedIds: readonly string[];
  readonly marquee: Rect | null;
  readonly camera?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}

const HANDLE_SIZE = 8; // screen pixels
const SELECTION_COLOR = '#6366f1';
const HANDLE_FILL = '#ffffff';

export function renderInteractiveScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  _canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: InteractiveSceneOptions,
): void {
  const { width, height, shapes, selectedIds, marquee, camera } = opts;

  clearCanvas(ctx, width, height);

  ctx.save();
  if (camera) {
    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
  }

  const zoom = camera?.zoom ?? 1;

  // --- Selection outlines ---
  if (selectedIds.length > 0) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([]);
    ctx.fillStyle = HANDLE_FILL;

    const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id));

    for (const shape of selectedShapes) {
      const b = shapeBounds(shape);
      const pad = 4 / zoom;
      ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    }

    // --- Handles — only when exactly one shape is selected ---
    if (selectedShapes.length === 1) {
      const b = shapeBounds(selectedShapes[0]!);
      const pad = 4 / zoom;
      const outerBounds: Rect = {
        x: b.x - pad,
        y: b.y - pad,
        width: b.width + pad * 2,
        height: b.height + pad * 2,
      };
      drawHandles(ctx, outerBounds, zoom);
    }
  }

  ctx.restore();

  // --- Marquee — drawn in screen space, no camera transform ---
  if (marquee) {
    ctx.save();
    if (camera) {
      ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
      ctx.scale(camera.zoom, camera.zoom);
    }

    ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);

    ctx.fillRect(marquee.x, marquee.y, marquee.width, marquee.height);
    ctx.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height);

    ctx.setLineDash([]);
    ctx.restore();
  }
}

function drawHandles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bounds: Rect,
  zoom: number,
): void {
  const s = HANDLE_SIZE / zoom; // Handle size in world coords
  const half = s / 2;

  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  const positions: Array<[number, number]> = [
    [bounds.x, bounds.y], // top-left
    [cx, bounds.y], // top-center
    [right, bounds.y], // top-right
    [right, cy], // middle-right
    [right, bottom], // bottom-right
    [cx, bottom], // bottom-center
    [bounds.x, bottom], // bottom-left
    [bounds.x, cy], // middle-left
  ];

  for (const [x, y] of positions) {
    ctx.fillRect(x - half, y - half, s, s);
    ctx.strokeRect(x - half, y - half, s, s);
  }
}
