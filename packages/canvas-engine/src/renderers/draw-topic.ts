import { DIAGRAM_BOX_INK } from '../diagram/palette.js';
import { mindMapFoldBadges } from '../mindmap/fold.js';
import { mindMapBranches, type MindMapBranch } from '../mindmap/layout.js';
import { strokeWidthOf, type Shape, type TopicShape } from '../shapes/shape.js';
import { DEFAULT_STROKE_COLOR, strokeColorFor } from '../shapes/style.js';
import { readTopicLook, topicCornerRadius, topicSize, topicTextLayout } from '../shapes/topic.js';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * The colour a topic's words are set in.
 *
 * The board's ink on a bare box. On a filled one a fixed dark ink instead, as
 * a diagram's boxes have: the fills are pale, and the ink turns pale on a dark
 * board.
 */
export function topicInk(topic: TopicShape, darkMode: boolean): string {
  return topic.fillColor ? DIAGRAM_BOX_INK : strokeColorFor(DEFAULT_STROKE_COLOR, darkMode);
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * A topic's box and words. `topic.strokeColor` is expected already themed,
 * as `drawSceneShape` hands every shape over.
 *
 * `withText` false leaves the words to the overlay they are being typed in.
 */
export function drawTopicShape(
  ctx: Ctx,
  topic: TopicShape,
  darkMode: boolean,
  withText: boolean,
): void {
  const { width, height } = topicSize(topic);
  const underlined = readTopicLook(topic.topicShape) === 'underline';
  ctx.save();
  roundedRect(ctx, topic.x, topic.y, width, height, topicCornerRadius(topic));
  if (topic.fillColor) {
    ctx.fillStyle = topic.fillColor;
    ctx.fill();
  }
  ctx.strokeStyle = topic.strokeColor;
  ctx.lineWidth = strokeWidthOf(topic);
  if (underlined) {
    // No box: a rule under the words, which the lines either side run into.
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(topic.x, topic.y + height);
    ctx.lineTo(topic.x + width, topic.y + height);
  }
  ctx.stroke();

  if (withText) {
    const text = topicTextLayout(topic);
    ctx.fillStyle = topicInk(topic, darkMode);
    ctx.font = `${text.fontSize}px ${topic.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    topic.text.split('\n').forEach((line, index) => {
      ctx.fillText(line, text.x, text.y + index * text.lineHeight);
    });
  }
  ctx.restore();
}

type BranchPoint = { readonly x: number; readonly y: number };

/**
 * The path a branch is drawn along, in the map's line style. A curve leaves
 * the parent and arrives at the child square to the way the map grows; an
 * elbow turns twice, half way between them; a straight line goes direct.
 */
function branchPath(branch: MindMapBranch):
  | {
      readonly kind: 'curve';
      readonly from: BranchPoint;
      readonly c1: BranchPoint;
      readonly c2: BranchPoint;
      readonly to: BranchPoint;
    }
  | { readonly kind: 'line'; readonly points: readonly BranchPoint[] } {
  const { from, to, vertical } = branch;
  const middleX = (from.x + to.x) / 2;
  const middleY = (from.y + to.y) / 2;
  switch (branch.lines) {
    case 'straight':
      return { kind: 'line', points: [from, to] };
    case 'elbow':
      return {
        kind: 'line',
        points: vertical
          ? [from, { x: from.x, y: middleY }, { x: to.x, y: middleY }, to]
          : [from, { x: middleX, y: from.y }, { x: middleX, y: to.y }, to],
      };
    default:
      return vertical
        ? { kind: 'curve', from, c1: { x: from.x, y: middleY }, c2: { x: to.x, y: middleY }, to }
        : { kind: 'curve', from, c1: { x: middleX, y: from.y }, c2: { x: middleX, y: to.y }, to };
  }
}

function branchPathData(branch: MindMapBranch): string {
  const path = branchPath(branch);
  if (path.kind === 'curve') {
    const { from, c1, c2, to } = path;
    return (
      `M ${num(from.x)} ${num(from.y)} C ${num(c1.x)} ${num(c1.y)} ` +
      `${num(c2.x)} ${num(c2.y)} ${num(to.x)} ${num(to.y)}`
    );
  }
  return path.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${num(point.x)} ${num(point.y)}`)
    .join(' ');
}

/**
 * Every branch line among these shapes, in the colour and weight of the topic
 * it leads to.
 *
 * Drawn under everything, before any shape: a line runs edge to edge between
 * two boxes, so nothing of the map is covered by it, and anything placed over
 * a map should cover its lines along with its boxes.
 */
export function drawMindMapBranches(ctx: Ctx, shapes: readonly Shape[], darkMode: boolean): void {
  const branches = mindMapBranches(shapes);
  if (branches.length === 0) return;
  const previousAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const branch of branches) {
    const path = branchPath(branch);
    ctx.globalAlpha = previousAlpha * (branch.child.opacity / 100);
    ctx.strokeStyle = strokeColorFor(branch.child.strokeColor, darkMode);
    ctx.lineWidth = strokeWidthOf(branch.child);
    ctx.beginPath();
    if (path.kind === 'curve') {
      ctx.moveTo(path.from.x, path.from.y);
      ctx.bezierCurveTo(path.c1.x, path.c1.y, path.c2.x, path.c2.y, path.to.x, path.to.y);
    } else {
      path.points.forEach((point, index) =>
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
      );
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = previousAlpha;
}

function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** A topic as SVG, drawn as the canvas draws it. */
export function topicToSvg(topic: TopicShape, darkMode: boolean): string {
  const { width, height } = topicSize(topic);
  const radius = Math.min(topicCornerRadius(topic), width / 2, height / 2);
  const underlined = readTopicLook(topic.topicShape) === 'underline';
  const stroke = `stroke="${escapeXml(topic.strokeColor)}" stroke-width="${num(strokeWidthOf(topic))}"`;
  const box =
    `<rect x="${num(topic.x)}" y="${num(topic.y)}" width="${num(width)}" height="${num(height)}" ` +
    `rx="${num(radius)}" fill="${topic.fillColor ? escapeXml(topic.fillColor) : 'none'}" ` +
    (underlined
      ? `stroke="none"/><path d="M ${num(topic.x)} ${num(topic.y + height)} H ${num(
          topic.x + width,
        )}" ${stroke} stroke-linecap="round"/>`
      : `${stroke}/>`);
  const text = topicTextLayout(topic);
  const ink = escapeXml(topicInk(topic, darkMode));
  const words = topic.text
    .split('\n')
    .map(
      (line, index) =>
        `<text x="${num(text.x)}" y="${num(text.y + index * text.lineHeight)}" ` +
        `font-family="${escapeXml(topic.fontFamily)}" font-size="${num(text.fontSize)}px" ` +
        `fill="${ink}" text-anchor="middle" dominant-baseline="text-before-edge" ` +
        `style="white-space: pre;">${escapeXml(line)}</text>`,
    )
    .join('');
  return box + words;
}

/** Every branch line among these shapes as SVG paths, for the bottom of the drawing. */
export function mindMapBranchesToSvg(shapes: readonly Shape[], darkMode: boolean): string {
  return mindMapBranches(shapes)
    .map((branch) => {
      const opacity =
        branch.child.opacity < 100 ? ` opacity="${num(branch.child.opacity / 100)}"` : '';
      return (
        `<path d="${branchPathData(branch)}" fill="none" stroke-linejoin="round" ` +
        `stroke="${escapeXml(strokeColorFor(branch.child.strokeColor, darkMode))}" ` +
        `stroke-width="${num(strokeWidthOf(branch.child))}" stroke-linecap="round"${opacity}/>`
      );
    })
    .join('\n');
}

const BADGE_INK = '#ffffff';

/**
 * The fold badges on these shapes — see `mindMapFoldBadges` — drawn over the
 * topics they belong to. Handed the whole board, folded topics included.
 */
export function drawMindMapFoldBadges(ctx: Ctx, shapes: readonly Shape[], darkMode: boolean): void {
  const badges = mindMapFoldBadges(shapes);
  if (badges.length === 0) return;
  const previousAlpha = ctx.globalAlpha;
  ctx.save();
  for (const { topic, count, from, centre, radius } of badges) {
    const colour = strokeColorFor(topic.strokeColor, darkMode);
    ctx.globalAlpha = previousAlpha * (topic.opacity / 100);
    ctx.strokeStyle = colour;
    ctx.lineWidth = strokeWidthOf(topic);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(centre.x, centre.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.fillStyle = darkMode && colour !== topic.strokeColor ? '#1e1e1e' : BADGE_INK;
    ctx.font = `600 ${radius * 1.05}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), centre.x, centre.y + radius * 0.05);
  }
  ctx.restore();
  ctx.globalAlpha = previousAlpha;
}

/** The fold badges as SVG, drawn as the canvas draws them. */
export function mindMapFoldBadgesToSvg(shapes: readonly Shape[], darkMode: boolean): string {
  return mindMapFoldBadges(shapes)
    .map(({ topic, count, from, centre, radius }) => {
      const colour = strokeColorFor(topic.strokeColor, darkMode);
      const ink = darkMode && colour !== topic.strokeColor ? '#1e1e1e' : BADGE_INK;
      const opacity = topic.opacity < 100 ? ` opacity="${num(topic.opacity / 100)}"` : '';
      return (
        `<g${opacity}><path d="M ${num(from.x)} ${num(from.y)} L ${num(centre.x)} ${num(centre.y)}" ` +
        `stroke="${escapeXml(colour)}" stroke-width="${num(strokeWidthOf(topic))}"/>` +
        `<circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="${num(radius)}" fill="${escapeXml(colour)}"/>` +
        `<text x="${num(centre.x)}" y="${num(centre.y)}" font-family="system-ui, sans-serif" ` +
        `font-weight="600" font-size="${num(radius * 1.05)}px" fill="${ink}" text-anchor="middle" ` +
        `dominant-baseline="central">${count}</text></g>`
      );
    })
    .join('\n');
}
