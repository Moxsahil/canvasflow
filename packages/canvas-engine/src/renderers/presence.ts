import type { Shape } from '../shapes/shape.js';
import { shapeBounds } from '../shapes/bounds.js';
import { clearCanvas } from '../utils/canvas.js';
import { PEER_STALE_AFTER_MS, type Peer } from '../presence/presence-state.js';
import {
  presenceColorFor,
  presenceHaloColor,
  presencePillTextColor,
  type PresenceTheme,
} from '../presence/presence-color.js';

/**
 * Remote collaborators — cursors, name pills and selection outlines.
 *
 * Drawn on its own canvas, which sits *outside* the `.canvas-stack` container.
 * That container carries `filter: var(--theme-filter)`, an invert+hue-rotate in
 * dark mode, so anything painted inside it has its colours flipped. A peer's
 * colour has to survive intact — a teal collaborator rendering orange for half
 * the room is worse than no colour at all — so this layer is a sibling of the
 * stack rather than a member of it.
 *
 * Everything here is drawn in screen space. The scene layers work under the
 * camera transform because their content is world geometry that should scale;
 * a cursor and a name pill are chrome, and chrome keeps its size at every zoom.
 */

export interface PresenceSceneOptions {
  readonly width: number;
  readonly height: number;
  readonly camera: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly theme: PresenceTheme;
  readonly peers: readonly Peer[];
  /** Needed to resolve each peer's `selectedIds` to bounds. */
  readonly shapes: readonly Shape[];
  /** Injectable for tests; defaults to the wall clock. */
  readonly now?: number;
}

/** Arrow dimensions, matching Excalidraw's cursor so the shape reads as familiar. */
const CURSOR_WIDTH = 11;
const CURSOR_HEIGHT = 14;

const HALO_WIDTH = 6;
const INACTIVE_ALPHA = 0.3;

const PILL_FONT = '600 12px sans-serif';
const PILL_PAD_X = 6;
const PILL_PAD_Y = 3;
const PILL_RADIUS = 8;

const RIPPLE_RADIUS = 15;

const SELECTION_LINE_WIDTH = 1.5;
const SELECTION_DASH: readonly number[] = [5, 4];
const SELECTION_PAD = 4;

const TAG_FONT = '500 10px sans-serif';
const TAG_PAD_X = 5;
const TAG_HEIGHT = 15;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function renderPresenceScene(ctx: Ctx, opts: PresenceSceneOptions): void {
  const { width, height, camera, theme, peers, shapes, now = Date.now() } = opts;

  clearCanvas(ctx, width, height);

  const visible = peers.filter((peer) => isPeerVisible(peer, now));
  if (visible.length === 0) return;

  const shapesById = new Map<string, Shape>();
  for (const shape of shapes) shapesById.set(shape.id, shape);

  // Selections first, so a cursor is never painted under another peer's outline.
  for (const peer of visible) {
    drawRemoteSelection(ctx, peer, shapesById, camera, theme);
  }

  for (const peer of visible) {
    drawCursor(ctx, peer, camera, theme, width, height);
  }
}

/**
 * Away peers keep their avatar but lose their cursor — a pointer parked where
 * someone left the tab reads as attention that isn't there.
 *
 * Stale peers are dropped outright: see PEER_STALE_AFTER_MS.
 */
function isPeerVisible(peer: Peer, now: number): boolean {
  if (peer.activity === 'away') return false;
  if (peer.lastActiveAt > 0 && now - peer.lastActiveAt > PEER_STALE_AFTER_MS) return false;
  return true;
}

function worldToScreenX(x: number, camera: PresenceSceneOptions['camera']): number {
  return (x - camera.x) * camera.zoom;
}

function worldToScreenY(y: number, camera: PresenceSceneOptions['camera']): number {
  return (y - camera.y) * camera.zoom;
}

function drawRemoteSelection(
  ctx: Ctx,
  peer: Peer,
  shapesById: Map<string, Shape>,
  camera: PresenceSceneOptions['camera'],
  theme: PresenceTheme,
): void {
  if (peer.selectedIds.length === 0) return;

  const color = presenceColorFor(peer.user.id, theme);

  let unionLeft = Infinity;
  let unionTop = Infinity;
  let drew = false;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = SELECTION_LINE_WIDTH;
  ctx.setLineDash([...SELECTION_DASH]);
  ctx.globalAlpha = peer.activity === 'idle' ? INACTIVE_ALPHA : 1;

  for (const id of peer.selectedIds) {
    const shape = shapesById.get(id);
    if (!shape) continue;

    const bounds = shapeBounds(shape);
    const left = worldToScreenX(bounds.x, camera) - SELECTION_PAD;
    const top = worldToScreenY(bounds.y, camera) - SELECTION_PAD;
    const w = bounds.width * camera.zoom + SELECTION_PAD * 2;
    const h = bounds.height * camera.zoom + SELECTION_PAD * 2;

    // No resize handles: those are yours alone, and drawing them for someone
    // else invites a click that can't do anything.
    ctx.strokeRect(left, top, w, h);

    unionLeft = Math.min(unionLeft, left);
    unionTop = Math.min(unionTop, top);
    drew = true;
  }

  ctx.setLineDash([]);

  // One tag for the whole selection, not one per shape.
  if (drew && peer.user.name) {
    drawSelectionTag(ctx, peer.user.name, unionLeft, unionTop, color, theme);
  }

  ctx.restore();
}

function drawSelectionTag(
  ctx: Ctx,
  name: string,
  left: number,
  top: number,
  color: string,
  theme: PresenceTheme,
): void {
  ctx.font = TAG_FONT;
  const textWidth = ctx.measureText(name).width;
  const boxWidth = textWidth + TAG_PAD_X * 2;
  const boxY = top - TAG_HEIGHT - 2;

  roundedRectPath(ctx, left, boxY, boxWidth, TAG_HEIGHT, 3);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.fillStyle = presencePillTextColor(theme);
  ctx.textBaseline = 'middle';
  ctx.fillText(name, left + TAG_PAD_X, boxY + TAG_HEIGHT / 2);
}

function drawCursor(
  ctx: Ctx,
  peer: Peer,
  camera: PresenceSceneOptions['camera'],
  theme: PresenceTheme,
  width: number,
  height: number,
): void {
  if (!peer.cursor) return;

  const rawX = worldToScreenX(peer.cursor.x, camera);
  const rawY = worldToScreenY(peer.cursor.y, camera);

  // Clamp to the viewport instead of letting the cursor disappear: you keep the
  // awareness that someone is working off-screen, without a label pinned to
  // your border shouting about it.
  const x = clamp(rawX, 0, width - CURSOR_WIDTH);
  const y = clamp(rawY, 0, height - CURSOR_HEIGHT);
  const isOutOfBounds = x !== rawX || y !== rawY;
  const isInactive = isOutOfBounds || peer.activity === 'idle';

  const color = presenceColorFor(peer.user.id, theme);
  const halo = presenceHaloColor(theme);

  ctx.save();
  if (isInactive) ctx.globalAlpha = INACTIVE_ALPHA;

  // Click ripple. Suppressed off-screen, where the clamped position is a lie
  // about where the click landed.
  if (peer.button === 'down' && !isOutOfBounds) {
    ctx.beginPath();
    ctx.arc(x, y, RIPPLE_RADIUS, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.globalAlpha = (isInactive ? INACTIVE_ALPHA : 1) * 0.55;
    ctx.stroke();

    ctx.globalAlpha = isInactive ? INACTIVE_ALPHA : 1;
    ctx.beginPath();
    ctx.arc(x, y, RIPPLE_RADIUS, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // Halo first, then the arrow on top of it: a stroked-then-filled path in the
  // ground colour gives the arrow a border that separates it from whatever
  // shape it happens to be sitting on.
  cursorPath(ctx, x, y);
  ctx.strokeStyle = halo;
  ctx.lineWidth = HALO_WIDTH;
  ctx.lineJoin = 'round';
  ctx.stroke();

  cursorPath(ctx, x, y);
  ctx.fillStyle = color;
  ctx.fill();

  if (!isOutOfBounds && peer.user.name) {
    drawNamePill(ctx, peer.user.name, x, y, color, theme);
  }

  ctx.restore();
}

function cursorPath(ctx: Ctx, x: number, y: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 14);
  ctx.lineTo(x + 4, y + 9);
  ctx.lineTo(x + 11, y + 8);
  ctx.closePath();
}

function drawNamePill(
  ctx: Ctx,
  name: string,
  x: number,
  y: number,
  color: string,
  theme: PresenceTheme,
): void {
  ctx.font = PILL_FONT;
  const textWidth = ctx.measureText(name).width;
  const boxWidth = textWidth + PILL_PAD_X * 2;
  const boxHeight = 12 + PILL_PAD_Y * 2;
  const boxX = x + CURSOR_WIDTH / 2;
  const boxY = y + CURSOR_HEIGHT + 2;

  roundedRectPath(ctx, boxX, boxY, boxWidth, boxHeight, PILL_RADIUS);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.fillStyle = presencePillTextColor(theme);
  ctx.textBaseline = 'middle';
  ctx.fillText(name, boxX + PILL_PAD_X, boxY + boxHeight / 2);
}

/**
 * Rounded rectangle via arcTo rather than `ctx.roundRect`, which needs a
 * feature check and is absent from some OffscreenCanvas implementations —
 * including the one the export path renders through.
 */
function roundedRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function clamp(value: number, min: number, max: number): number {
  // A viewport narrower than the cursor would invert the bounds; Math.max last
  // keeps the result at `min` rather than snapping to a negative `max`.
  return Math.max(min, Math.min(value, max));
}
