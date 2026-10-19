import { MAX_BOOKMARK_TITLE, readBookmarkText, readPreviewImageName } from '../shapes/bookmark.js';
import type { EmbedMedium } from '../shapes/embed.js';
import { resolveEmbed } from '../shapes/embed.js';
import { linkLabel } from '../shapes/link.js';
import type { EmbedShape } from '../shapes/shape.js';
import type { ImageSource } from './draw-image.js';

/**
 * The card an embed is drawn as on the board, and in every export.
 *
 * The page itself is somebody else's document in a frame of its own, which a
 * canvas cannot paint and an export cannot capture. So the board draws what
 * the page is — whose it is, and where it lives — in the shape's own place in
 * the stack, and the page is loaded over it only while someone has it open.
 *
 * Once the page has been read, the card is its still — a video's thumbnail —
 * with the badge over it and the page's title along the foot, so a board with
 * videos on it exports looking the way it does on screen. Until then, and for
 * a page with no picture, it is the site's name and the page's title.
 *
 * Laid out once here and painted twice, by the canvas and by the SVG writer,
 * so the two are the same card. Text is fitted by an estimate rather than by
 * measuring, for the same reason: an SVG has nothing to measure with.
 */

const FONT_FAMILY = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

/** An average glyph's width as a share of the font size, for fitting text. */
const GLYPH_WIDTH = 0.56;

export interface EmbedCardPalette {
  readonly fill: string;
  readonly border: string;
  readonly badge: string;
  readonly mark: string;
  readonly title: string;
  readonly detail: string;
}

const LIGHT: EmbedCardPalette = {
  fill: '#f5f5f8',
  border: '#d9d9e1',
  badge: '#1f1f25',
  mark: '#ffffff',
  title: '#1f1f25',
  detail: '#6b6b78',
};

const DARK: EmbedCardPalette = {
  fill: '#24242a',
  border: '#3a3a44',
  badge: '#ececf1',
  mark: '#1b1b1f',
  title: '#ececf1',
  detail: '#9d9daa',
};

export function embedCardPalette(darkMode: boolean): EmbedCardPalette {
  return darkMode ? DARK : LIGHT;
}

export interface EmbedCardText {
  readonly text: string;
  readonly x: number;
  /** The baseline's distance from the top of the line, as `y`. */
  readonly y: number;
  readonly fontSize: number;
  readonly fontWeight: number;
}

export interface EmbedCardLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly medium: EmbedMedium;
  readonly badge: { readonly cx: number; readonly cy: number; readonly r: number };
  /** The site's name; absent when the box is too small to read it, or the address embeds nothing. */
  readonly title: EmbedCardText | null;
  /** The page's title once it is known, else where the page lives, cut to the width. */
  readonly detail: EmbedCardText | null;
  /** The page's still, by its preview name, when it has one. */
  readonly poster: string | null;
  /** The title along the foot of the still, left-aligned; null without room or a title. */
  readonly posterTitle: EmbedCardText | null;
}

/** Over a picture the badge is a dark disc, whatever the theme, so it reads on any frame. */
const POSTER_BADGE = 'rgba(0, 0, 0, 0.55)';
const POSTER_MARK = '#ffffff';
const POSTER_TITLE = '#ffffff';
/** The shade behind the title, darkest at the foot, so white words read on a light frame. */
const SCRIM = [
  [0.45, 'rgba(0, 0, 0, 0)'],
  [1, 'rgba(0, 0, 0, 0.62)'],
] as const;

/** Text cut with an ellipsis to fit `width` at `fontSize`, or null when nothing fits. */
function fitted(text: string, fontSize: number, width: number): string | null {
  const room = Math.floor(width / (fontSize * GLYPH_WIDTH));
  if (room < 4) return null;
  return text.length <= room ? text : `${text.slice(0, room - 1)}…`;
}

export function embedCardLayout(shape: EmbedShape): EmbedCardLayout {
  const { x, y } = shape;
  const width = Math.max(0, shape.width);
  const height = Math.max(0, shape.height);
  const shortest = Math.min(width, height);
  const embed = resolveEmbed(shape.url);
  const medium = embed?.provider.medium ?? 'page';

  const radius = Math.min(10, shortest / 4);
  const r = Math.min(32, Math.max(6, shortest * 0.12));
  const titleSize = Math.min(20, Math.max(10, shortest * 0.065));
  const detailSize = titleSize * 0.78;
  const gap = r * 0.55;
  const inner = width - 32;

  const pageTitle = readBookmarkText(shape.title, MAX_BOOKMARK_TITLE);
  const title = embed ? fitted(embed.provider.name, titleSize, inner) : null;
  const detail = fitted(pageTitle || linkLabel(shape.url), detailSize, inner);
  const poster = embed ? readPreviewImageName(shape.poster) : null;
  const posterTitle =
    poster && pageTitle && height >= 80 ? fitted(pageTitle, titleSize * 0.85, inner) : null;
  // The words go under the badge only while the box is tall enough to hold
  // all three; a strip of a box keeps the badge alone, centred.
  const roomForWords = height >= r * 2 + gap + titleSize * 1.25 + detailSize * 1.5 + 16;
  const showTitle = roomForWords && title !== null;
  const showDetail = roomForWords && detail !== null;

  const block =
    r * 2 +
    (showTitle ? gap + titleSize * 1.2 : 0) +
    (showDetail ? (showTitle ? 4 : gap) + detailSize * 1.2 : 0);
  const top = y + (height - block) / 2;
  const cx = x + width / 2;
  const cy = top + r;

  let cursor = top + r * 2;
  let titleText: EmbedCardText | null = null;
  if (showTitle) {
    cursor += gap;
    titleText = { text: title, x: cx, y: cursor + titleSize, fontSize: titleSize, fontWeight: 600 };
    cursor += titleSize * 1.2;
  }
  let detailText: EmbedCardText | null = null;
  if (showDetail) {
    cursor += showTitle ? 4 : gap;
    detailText = {
      text: detail,
      x: cx,
      y: cursor + detailSize,
      fontSize: detailSize,
      fontWeight: 400,
    };
  }

  return {
    x,
    y,
    width,
    height,
    radius,
    medium,
    badge: { cx, cy, r },
    title: titleText,
    detail: detailText,
    poster,
    posterTitle: posterTitle
      ? {
          text: posterTitle,
          x: x + 16,
          y: y + height - 16,
          fontSize: titleSize * 0.85,
          fontWeight: 600,
        }
      : null,
  };
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

/**
 * The mark inside the badge, as polylines in a 24-unit box: a play triangle
 * for something to watch or hear, a page with an arrow out of it for the rest.
 * Plain points rather than path data, so the canvas can trace them without
 * `Path2D`, which not every canvas it is painted on has.
 */
export function embedMark(medium: EmbedMedium): {
  readonly lines: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  readonly filled: boolean;
} {
  return medium === 'page'
    ? {
        lines: [
          [
            [10, 5],
            [5, 5],
            [5, 19],
            [19, 19],
            [19, 14],
          ],
          [
            [14, 5],
            [19, 5],
            [19, 10],
          ],
          [
            [19, 5],
            [11, 13],
          ],
        ],
        filled: false,
      }
    : {
        lines: [
          [
            [9, 6.5],
            [9, 17.5],
            [18, 12],
          ],
        ],
        filled: true,
      };
}

function markPathData(mark: ReturnType<typeof embedMark>): string {
  return mark.lines
    .map(
      (line) =>
        line.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${num(px)} ${num(py)}`).join(' ') +
        (mark.filled ? ' Z' : ''),
    )
    .join(' ');
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

export function drawEmbedShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: EmbedShape,
  darkMode: boolean,
  images?: ImageSource,
): void {
  const layout = embedCardLayout(shape);
  if (layout.width === 0 || layout.height === 0) return;
  const palette = embedCardPalette(darkMode);
  const still = layout.poster ? (images?.get(layout.poster) ?? null) : null;
  const stillWidth = still ? ((still as { width?: number }).width ?? 0) : 0;
  const stillHeight = still ? ((still as { height?: number }).height ?? 0) : 0;
  const onPoster = still !== null && stillWidth > 0 && stillHeight > 0;

  ctx.save();
  roundedRect(ctx, layout.x, layout.y, layout.width, layout.height, layout.radius);
  ctx.fillStyle = palette.fill;
  ctx.fill();
  if (onPoster) {
    ctx.save();
    ctx.clip();
    const crop = coverCrop(stillWidth, stillHeight, layout.width, layout.height);
    ctx.drawImage(
      still,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      layout.x,
      layout.y,
      layout.width,
      layout.height,
    );
    if (layout.posterTitle) {
      const scrim = ctx.createLinearGradient(0, layout.y, 0, layout.y + layout.height);
      for (const [stop, color] of SCRIM) scrim.addColorStop(stop, color);
      ctx.fillStyle = scrim;
      ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
    }
    ctx.restore();
    roundedRect(ctx, layout.x, layout.y, layout.width, layout.height, layout.radius);
  }
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const { cx, cy } = layout.badge;
  // Over a still the badge sits in the middle of the frame, as a player's does.
  const r = layout.badge.r;
  const badgeY = onPoster ? layout.y + layout.height / 2 : cy;
  ctx.beginPath();
  ctx.arc(cx, badgeY, r, 0, Math.PI * 2);
  ctx.fillStyle = onPoster ? POSTER_BADGE : palette.badge;
  ctx.fill();

  // The mark is drawn in a 24-unit box scaled to sit inside the badge.
  const mark = embedMark(layout.medium);
  const size = r * 1.15;
  ctx.translate(cx - size / 2, badgeY - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.beginPath();
  for (const line of mark.lines) {
    line.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    if (mark.filled) ctx.closePath();
  }
  const markColor = onPoster ? POSTER_MARK : palette.mark;
  if (mark.filled) {
    ctx.fillStyle = markColor;
    ctx.fill();
  } else {
    ctx.strokeStyle = markColor;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (onPoster) {
    const line = layout.posterTitle;
    if (line) {
      ctx.textAlign = 'left';
      ctx.font = `${line.fontWeight} ${line.fontSize}px ${FONT_FAMILY}`;
      ctx.fillStyle = POSTER_TITLE;
      ctx.fillText(line.text, line.x, line.y);
    }
  } else {
    ctx.textAlign = 'center';
    for (const [line, color] of [
      [layout.title, palette.title],
      [layout.detail, palette.detail],
    ] as const) {
      if (!line) continue;
      ctx.font = `${line.fontWeight} ${line.fontSize}px ${FONT_FAMILY}`;
      ctx.fillStyle = color;
      ctx.fillText(line.text, line.x, line.y);
    }
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

/** The same card as SVG markup; the still is drawn when its bytes were resolved. */
export function embedToSvg(
  shape: EmbedShape,
  darkMode: boolean,
  imageDataUrls?: ReadonlyMap<string, string>,
): string {
  const layout = embedCardLayout(shape);
  if (layout.width === 0 || layout.height === 0) return '';
  const palette = embedCardPalette(darkMode);
  const stillUrl = layout.poster ? imageDataUrls?.get(layout.poster) : undefined;
  if (stillUrl) return posterToSvg(shape, layout, palette, stillUrl);
  const { cx, cy, r } = layout.badge;
  const mark = embedMark(layout.medium);
  const size = r * 1.15;
  const markPaint = mark.filled
    ? `fill="${palette.mark}"`
    : `fill="none" stroke="${palette.mark}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;

  const lines = [
    [layout.title, palette.title],
    [layout.detail, palette.detail],
  ] as const;
  const words = lines
    .filter(([line]) => line !== null)
    .map(
      ([line, color]) =>
        `<text x="${num(line!.x)}" y="${num(line!.y)}" font-family="${escapeXml(FONT_FAMILY)}" ` +
        `font-size="${num(line!.fontSize)}px" font-weight="${line!.fontWeight}" fill="${color}" ` +
        `text-anchor="middle">${escapeXml(line!.text)}</text>`,
    )
    .join('');

  return (
    `<rect x="${num(layout.x)}" y="${num(layout.y)}" width="${num(layout.width)}" ` +
    `height="${num(layout.height)}" rx="${num(layout.radius)}" fill="${palette.fill}" ` +
    `stroke="${palette.border}" stroke-width="1"/>` +
    `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="${palette.badge}"/>` +
    `<path d="${markPathData(mark)}" ${markPaint} transform="translate(${num(cx - size / 2)} ${num(
      cy - size / 2,
    )}) scale(${num(size / 24)})"/>` +
    words
  );
}

function posterToSvg(
  shape: EmbedShape,
  layout: EmbedCardLayout,
  palette: EmbedCardPalette,
  stillUrl: string,
): string {
  const box = `x="${num(layout.x)}" y="${num(layout.y)}" width="${num(layout.width)}" height="${num(layout.height)}"`;
  const clipId = `embed-${shape.id}`;
  const scrimId = `embed-scrim-${shape.id}`;
  const { cx, r } = layout.badge;
  const cy = layout.y + layout.height / 2;
  const mark = embedMark(layout.medium);
  const size = r * 1.15;
  const markPaint = mark.filled
    ? `fill="${POSTER_MARK}"`
    : `fill="none" stroke="${POSTER_MARK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  const title = layout.posterTitle;

  return (
    `<clipPath id="${escapeXml(clipId)}"><rect ${box} rx="${num(layout.radius)}"/></clipPath>` +
    `<g clip-path="url(#${escapeXml(clipId)})">` +
    `<rect ${box} fill="${palette.fill}"/>` +
    `<image ${box} preserveAspectRatio="xMidYMid slice" href="${escapeXml(stillUrl)}"/>` +
    (title
      ? `<linearGradient id="${escapeXml(scrimId)}" x1="0" y1="0" x2="0" y2="1">` +
        SCRIM.map(([stop, color]) => `<stop offset="${stop}" stop-color="${color}"/>`).join('') +
        `</linearGradient><rect ${box} fill="url(#${escapeXml(scrimId)})"/>`
      : '') +
    `</g>` +
    `<rect ${box} rx="${num(layout.radius)}" fill="none" stroke="${palette.border}" stroke-width="1"/>` +
    `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="${POSTER_BADGE}"/>` +
    `<path d="${markPathData(mark)}" ${markPaint} transform="translate(${num(cx - size / 2)} ${num(
      cy - size / 2,
    )}) scale(${num(size / 24)})"/>` +
    (title
      ? `<text x="${num(title.x)}" y="${num(title.y)}" font-family="${escapeXml(FONT_FAMILY)}" ` +
        `font-size="${num(title.fontSize)}px" font-weight="${title.fontWeight}" fill="${POSTER_TITLE}">` +
        `${escapeXml(title.text)}</text>`
      : '')
  );
}
