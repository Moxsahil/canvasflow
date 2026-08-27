import { LASER_WIDTH, type LaserTrail } from './laser-trail.js';

/**
 * Painting a laser trail.
 *
 * The width is the same from end to end. A trail that tapers is drawing the
 * pointer's history — this end is older than that one — but a laser has no
 * history to draw: while it is up it is all equally live, and when it goes it
 * goes as a whole. Taper also spends most of a stroke below a pixel wide, which
 * is what made the beam read as a scratch.
 *
 * Two passes make it read as light rather than ink — a wide, faint halo under a
 * narrow bright core. It is the cheapest convincing glow, and unlike a canvas
 * shadow it costs one extra stroke per path instead of a blur per frame.
 */

export interface LaserDrawOptions {
  /** The author's presence colour, so a trail is attributable at a glance. */
  readonly color: string;
  /** Current zoom, so the trail keeps its width on screen at any scale. */
  readonly zoom: number;
  /** Clock the trail's own timestamps are on. */
  readonly now: number;
}

/** How much wider the halo is than the core. */
const HALO_SCALE = 2.4;
const HALO_ALPHA = 0.25;

/** Slightly short of solid, so a trail crossing itself still shows the crossing. */
const CORE_ALPHA = 0.9;

export function drawLaserTrail(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  trail: LaserTrail,
  options: LaserDrawOptions,
): void {
  const strokes = trail.strokesAt(options.now);
  if (strokes.length === 0) return;

  // World units, so the trail is a constant width on screen however far the
  // board is zoomed — the same rule the peer cursors follow.
  const width = LASER_WIDTH / options.zoom;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = options.color;
  ctx.fillStyle = options.color;

  for (const pass of [
    { scale: HALO_SCALE, alpha: HALO_ALPHA },
    { scale: 1, alpha: CORE_ALPHA },
  ]) {
    ctx.globalAlpha = pass.alpha;
    ctx.lineWidth = width * pass.scale;

    for (const stroke of strokes) {
      const points = stroke.livePoints();
      if (points.length === 0) continue;

      // A press with no movement. The gesture is "look here", and a dot is the
      // honest picture of it — a zero-length path would draw nothing at all.
      if (points.length === 1) {
        ctx.beginPath();
        ctx.arc(points[0]!.x, points[0]!.y, (width * pass.scale) / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Curve through the midpoints rather than joining the samples directly:
      // the samples themselves become control points, which rounds off the
      // corners a low sample rate leaves behind. It matters most for a peer's
      // trail, which is only ever as dense as their cursor feed.
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length - 1; i++) {
        const point = points[i]!;
        const next = points[i + 1]!;
        ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
      }
      const last = points[points.length - 1]!;
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}
