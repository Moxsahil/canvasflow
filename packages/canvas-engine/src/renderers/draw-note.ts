import type { NoteShape } from '../shapes/shape.js';
import {
  DEFAULT_NOTE_COLOR,
  noteBounds,
  noteCornerRadius,
  noteFooter,
  noteLayout,
  noteShadowOffset,
} from '../shapes/note.js';
import { DEFAULT_STROKE_COLOR, strokeColorFor } from '../shapes/style.js';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The paper's shadow: a darker copy of it, set a little below. */
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.16)';
/** A hairline round the paper, so a pale note still has an edge on a white board. */
const EDGE_COLOR = 'rgba(0, 0, 0, 0.08)';
const EDGE_WIDTH = 1;
/**
 * The author's name sits on the board under the paper, so it is the board's
 * ink rather than the note's, quietened so the words lead — and still past
 * 4.5:1 on either board.
 */
const FOOTER_OPACITY = 0.7;

function footerInk(darkMode: boolean): string {
  return strokeColorFor(DEFAULT_STROKE_COLOR, darkMode);
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
 * A note's paper and words. Its ink is drawn as stored, not themed as the
 * board's ink is: the words sit on pale paper on either board.
 *
 * `withText` false leaves the words to the overlay they are being typed in.
 */
export function drawNoteShape(
  ctx: Ctx,
  note: NoteShape,
  withText: boolean,
  darkMode: boolean,
): void {
  const { x, y, width, height } = noteBounds(note);
  const radius = noteCornerRadius(note);
  ctx.save();

  roundedRect(ctx, x, y + noteShadowOffset(note), width, height, radius);
  ctx.fillStyle = SHADOW_COLOR;
  ctx.fill();

  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = note.fillColor ?? DEFAULT_NOTE_COLOR;
  ctx.fill();
  ctx.strokeStyle = EDGE_COLOR;
  ctx.lineWidth = EDGE_WIDTH;
  ctx.stroke();

  if (withText && note.text !== '') {
    const layout = noteLayout(note);
    ctx.fillStyle = note.strokeColor;
    ctx.font = `${layout.fontSize}px ${note.fontFamily}`;
    ctx.textAlign = note.textAlign;
    ctx.textBaseline = 'top';
    // Half the leading above each line, as a browser sets a line box, so the
    // words land where they were in the overlay they were typed into.
    const leading = (layout.lineHeight - layout.fontSize) / 2;
    layout.lines.forEach((line, index) => {
      ctx.fillText(line.text, layout.textX, layout.textY + leading + index * layout.lineHeight);
    });
  }

  // Kept while the words are open for typing: the name is not what is typed.
  const footer = noteFooter(note);
  if (footer) {
    ctx.globalAlpha *= FOOTER_OPACITY;
    ctx.fillStyle = footerInk(darkMode);
    ctx.font = `${footer.fontSize}px ${footer.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(footer.text, footer.x, footer.y);
  }
  ctx.restore();
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

const SVG_ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;

/** A note as SVG, drawn as the canvas draws it. */
export function noteToSvg(note: NoteShape, darkMode: boolean): string {
  const { x, y, width, height } = noteBounds(note);
  const radius = num(Math.min(noteCornerRadius(note), width / 2, height / 2));
  const box = `width="${num(width)}" height="${num(height)}" rx="${radius}"`;
  const paper =
    `<rect x="${num(x)}" y="${num(y + noteShadowOffset(note))}" ${box} fill="${SHADOW_COLOR}"/>` +
    `<rect x="${num(x)}" y="${num(y)}" ${box} ` +
    `fill="${escapeXml(note.fillColor ?? DEFAULT_NOTE_COLOR)}" ` +
    `stroke="${EDGE_COLOR}" stroke-width="${EDGE_WIDTH}"/>`;

  const layout = noteLayout(note);
  const leading = (layout.lineHeight - layout.fontSize) / 2;
  const words = layout.lines
    .map(
      (line, index) =>
        `<text x="${num(layout.textX)}" y="${num(layout.textY + leading + index * layout.lineHeight)}" ` +
        `font-family="${escapeXml(note.fontFamily)}" font-size="${num(layout.fontSize)}px" ` +
        `fill="${escapeXml(note.strokeColor)}" text-anchor="${SVG_ANCHOR[note.textAlign]}" ` +
        `dominant-baseline="text-before-edge" style="white-space: pre;">${escapeXml(line.text)}</text>`,
    )
    .join('');

  const footer = noteFooter(note);
  const byline = footer
    ? `<text x="${num(footer.x)}" y="${num(footer.y)}" ` +
      `font-family="${escapeXml(footer.fontFamily)}" font-size="${num(footer.fontSize)}px" ` +
      `fill="${escapeXml(footerInk(darkMode))}" fill-opacity="${FOOTER_OPACITY}" ` +
      `text-anchor="end" dominant-baseline="central" style="white-space: pre;">${escapeXml(footer.text)}</text>`
    : '';
  return paper + words + byline;
}
