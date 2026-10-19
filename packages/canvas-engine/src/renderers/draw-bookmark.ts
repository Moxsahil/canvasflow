import {
  bookmarkHost,
  MAX_BOOKMARK_DESCRIPTION,
  MAX_BOOKMARK_SITE_NAME,
  MAX_BOOKMARK_TITLE,
  readBookmarkText,
  readBookmarkUrl,
  readPreviewImageName,
} from '../shapes/bookmark.js';
import type { BookmarkShape } from '../shapes/shape.js';
import { measureTextWidth } from '../utils/text-measure.js';
import type { ImageSource } from './draw-image.js';

/**
 * A link card as the board draws it, and as every export draws it.
 *
 * Laid out once here and painted twice, by the canvas and by the SVG writer,
 * so the two are the same card: the picture across the top when there is one,
 * then the title, a line about the page, and the site it lives on.
 */

const FONT_FAMILY = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';
const PAD = 14;
const TITLE_SIZE = 15;
const DESCRIPTION_SIZE = 12.5;
const HOST_SIZE = 11.5;
const LINE = 1.32;
const RADIUS = 10;
/** Below this, a picture is a sliver and the room goes to the words instead. */
const MIN_IMAGE_HEIGHT = 48;

interface Palette {
  readonly fill: string;
  readonly border: string;
  readonly imageWell: string;
  readonly title: string;
  readonly text: string;
  readonly host: string;
}

const LIGHT: Palette = {
  fill: '#ffffff',
  border: '#d9d9e1',
  imageWell: '#ececf0',
  title: '#18181b',
  text: '#52525b',
  host: '#71717a',
};

const DARK: Palette = {
  fill: '#24242a',
  border: '#3a3a44',
  imageWell: '#2e2e36',
  title: '#f4f4f5',
  text: '#b4b4bb',
  host: '#8a8a93',
};

export interface BookmarkLine {
  readonly text: string;
  readonly x: number;
  /** The baseline. */
  readonly y: number;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly role: 'title' | 'text' | 'host';
}

export interface BookmarkLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  /** Where the picture goes, when the card has one and room for it. */
  readonly image: {
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly lines: readonly BookmarkLine[];
}

const font = (size: number, weight: number) => `${weight} ${size}px ${FONT_FAMILY}`;

/**
 * `text` broken into at most `maxLines` lines no wider than `width`, the last
 * one cut with an ellipsis if there was more.
 */
function wrap(
  text: string,
  size: number,
  weight: number,
  width: number,
  maxLines: number,
): string[] {
  if (maxLines <= 0 || !text) return [];
  const f = font(size, weight);
  const fits = (line: string) => measureTextWidth(line, f) <= width;
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let i = 0;
  for (; i < words.length; i++) {
    const tried = current ? `${current} ${words[i]}` : words[i]!;
    // A lone word longer than the line is taken whole, and cut below.
    if (fits(tried) || !current) {
      current = tried;
      continue;
    }
    lines.push(current);
    current = words[i]!;
    if (lines.length === maxLines) {
      current = '';
      break;
    }
  }
  if (current) lines.push(current);
  const more = i < words.length;

  return lines.map((line, index) => {
    const last = index === lines.length - 1;
    if (fits(line) && !(last && more)) return line;
    let cut = line;
    while (cut.length > 1 && !fits(`${cut}…`)) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  });
}

export function bookmarkLayout(shape: BookmarkShape): BookmarkLayout {
  const width = Math.max(0, shape.width);
  const height = Math.max(0, shape.height);
  const inner = Math.max(0, width - PAD * 2);
  const url = readBookmarkUrl(shape.url) ?? '';
  const host = url ? bookmarkHost(url) : '';
  const siteName = readBookmarkText(shape.siteName, MAX_BOOKMARK_SITE_NAME);
  const title = readBookmarkText(shape.title, MAX_BOOKMARK_TITLE) || host;
  const description = readBookmarkText(shape.description, MAX_BOOKMARK_DESCRIPTION);
  const footer =
    siteName && siteName.toLowerCase() !== host.toLowerCase() ? `${siteName} · ${host}` : host;

  // The words first, at the room they need; the picture takes what is left.
  const titleLines = wrap(title, TITLE_SIZE, 600, inner, 2);
  const hostLines = wrap(footer, HOST_SIZE, 400, inner, 1);
  const wordsHeight = (descriptionLines: number) =>
    PAD +
    titleLines.length * TITLE_SIZE * LINE +
    (descriptionLines > 0 ? 4 + descriptionLines * DESCRIPTION_SIZE * LINE : 0) +
    (hostLines.length > 0 ? 6 + HOST_SIZE * LINE : 0) +
    PAD;

  const name = readPreviewImageName(shape.image);
  let descriptionLines = wrap(description, DESCRIPTION_SIZE, 400, inner, 2);
  let imageHeight = name ? height - wordsHeight(descriptionLines.length) : 0;
  // A short card gives up the description before the picture.
  if (name && imageHeight < MIN_IMAGE_HEIGHT && descriptionLines.length > 0) {
    descriptionLines = [];
    imageHeight = height - wordsHeight(0);
  }
  const image =
    name && imageHeight >= MIN_IMAGE_HEIGHT
      ? { name, x: shape.x, y: shape.y, width, height: imageHeight }
      : null;

  const lines: BookmarkLine[] = [];
  let cursor = shape.y + (image ? image.height : 0) + PAD;
  const bottom = shape.y + height - PAD;
  const push = (
    text: string,
    size: number,
    weight: number,
    role: BookmarkLine['role'],
    gap: number,
  ) => {
    const top = cursor + gap;
    if (top + size * LINE > bottom + 1) return false;
    lines.push({ text, x: shape.x + PAD, y: top + size, fontSize: size, fontWeight: weight, role });
    cursor = top + size * LINE;
    return true;
  };

  titleLines.forEach((line) => push(line, TITLE_SIZE, 600, 'title', 0));
  descriptionLines.forEach((line, i) => push(line, DESCRIPTION_SIZE, 400, 'text', i === 0 ? 4 : 0));
  // The site sits at the foot of the card, wherever the words above end.
  if (hostLines[0]) {
    const top = bottom - HOST_SIZE * LINE;
    if (top >= cursor + 2) {
      lines.push({
        text: hostLines[0],
        x: shape.x + PAD,
        y: top + HOST_SIZE,
        fontSize: HOST_SIZE,
        fontWeight: 400,
        role: 'host',
      });
    }
  }

  return {
    x: shape.x,
    y: shape.y,
    width,
    height,
    radius: Math.min(RADIUS, width / 4, height / 4),
    image,
    lines,
  };
}

function colorFor(palette: Palette, role: BookmarkLine['role']): string {
  return role === 'title' ? palette.title : role === 'text' ? palette.text : palette.host;
}

function roundedRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** The part of a picture that covers a box of this shape, centred, as the source rectangle. */
function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const sw = boxWidth / scale;
  const sh = boxHeight / scale;
  return { sx: (sourceWidth - sw) / 2, sy: (sourceHeight - sh) / 2, sw, sh };
}

export function drawBookmarkShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: BookmarkShape,
  images: ImageSource | undefined,
  darkMode: boolean,
): void {
  const layout = bookmarkLayout(shape);
  if (layout.width === 0 || layout.height === 0) return;
  const palette = darkMode ? DARK : LIGHT;

  ctx.save();
  roundedRect(ctx, layout.x, layout.y, layout.width, layout.height, layout.radius);
  ctx.fillStyle = palette.fill;
  ctx.fill();

  if (layout.image) {
    const { x, y, width, height, name } = layout.image;
    ctx.save();
    ctx.clip();
    const bitmap = images?.get(name) ?? null;
    const sourceWidth = bitmap ? ((bitmap as { width?: number }).width ?? 0) : 0;
    const sourceHeight = bitmap ? ((bitmap as { height?: number }).height ?? 0) : 0;
    if (bitmap && sourceWidth > 0 && sourceHeight > 0) {
      const crop = coverCrop(sourceWidth, sourceHeight, width, height);
      ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, x, y, width, height);
    } else {
      // Held at its size while the picture is on its way, so nothing shifts when it lands.
      ctx.fillStyle = palette.imageWell;
      ctx.fillRect(x, y, width, height);
    }
    ctx.restore();
  }

  roundedRect(ctx, layout.x, layout.y, layout.width, layout.height, layout.radius);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of layout.lines) {
    ctx.font = font(line.fontSize, line.fontWeight);
    ctx.fillStyle = colorFor(palette, line.role);
    ctx.fillText(line.text, line.x, line.y);
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

/** The same card as SVG markup; the picture is drawn when its bytes were resolved. */
export function bookmarkToSvg(
  shape: BookmarkShape,
  imageDataUrls: ReadonlyMap<string, string> | undefined,
  darkMode: boolean,
): string {
  const layout = bookmarkLayout(shape);
  if (layout.width === 0 || layout.height === 0) return '';
  const palette = darkMode ? DARK : LIGHT;
  const box = `x="${num(layout.x)}" y="${num(layout.y)}" width="${num(layout.width)}" height="${num(layout.height)}" rx="${num(layout.radius)}"`;

  let picture = '';
  if (layout.image) {
    const { x, y, width, height, name } = layout.image;
    const clipId = `bookmark-${shape.id}`;
    const dataUrl = imageDataUrls?.get(name);
    const content = dataUrl
      ? `<image x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" preserveAspectRatio="xMidYMid slice" href="${escapeXml(dataUrl)}"/>`
      : `<rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" fill="${palette.imageWell}"/>`;
    picture = `<clipPath id="${escapeXml(clipId)}"><rect ${box}/></clipPath><g clip-path="url(#${escapeXml(clipId)})">${content}</g>`;
  }

  const words = layout.lines
    .map(
      (line) =>
        `<text x="${num(line.x)}" y="${num(line.y)}" font-family="${escapeXml(FONT_FAMILY)}" ` +
        `font-size="${num(line.fontSize)}px" font-weight="${line.fontWeight}" fill="${colorFor(palette, line.role)}">` +
        `${escapeXml(line.text)}</text>`,
    )
    .join('');

  return (
    `<rect ${box} fill="${palette.fill}"/>` +
    picture +
    `<rect ${box} fill="none" stroke="${palette.border}" stroke-width="1"/>` +
    words
  );
}
