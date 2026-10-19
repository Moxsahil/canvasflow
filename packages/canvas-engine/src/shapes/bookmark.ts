import type { Rect } from '../math.js';
import { readLink } from './link.js';
import type { BookmarkShape } from './shape.js';
import { resolveBaseStyle, type BaseStyleInput } from './style.js';

/**
 * A link card: a page from another site shown as its picture, its title, a
 * line about it and where it lives, and opened in a tab rather than on the
 * board.
 *
 * What the card says is written into the shape once the page has been read,
 * so everyone on the board sees the same card — and keeps seeing it if the
 * page later changes or goes away. Every field is read back through the
 * functions here, since anyone on the board can write anything into them.
 */

/** The size a new card is placed at, with room for a picture. */
export const BOOKMARK_SIZE = { width: 400, height: 320 } as const;
/** The height a card settles to when its page has no picture. */
export const BOOKMARK_TEXT_ONLY_HEIGHT = 128;
export const MIN_BOOKMARK_WIDTH = 160;
export const MIN_BOOKMARK_HEIGHT = 80;

/** As long as the preview service keeps them. */
export const MAX_BOOKMARK_TITLE = 300;
export const MAX_BOOKMARK_DESCRIPTION = 500;
export const MAX_BOOKMARK_SITE_NAME = 100;

/** A preview picture's object name: the hash of its bytes and its format. */
const PREVIEW_IMAGE_NAME = /^[0-9a-f]{64}\.(png|jpg|gif|webp)$/;

/** The page a card opens, or null where there is none to trust: a web address and nothing else. */
export function readBookmarkUrl(value: unknown): string | null {
  const link = readLink(value);
  return link && /^https?:/i.test(link) ? link : null;
}

/** The card's picture, by the name the preview service stored it under; null for anything else. */
export function readPreviewImageName(value: unknown): string | null {
  return typeof value === 'string' && PREVIEW_IMAGE_NAME.test(value) ? value : null;
}

/** Stored text, as one plain line of at most `max` characters. */
export function readBookmarkText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const text = value
    // Control characters, which a stored title has no business holding.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= max ? text : text.slice(0, max);
}

/** The host a card names under its title: the address without `www.`. */
export function bookmarkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function createBookmark(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    url: string;
    title?: string;
    description?: string;
    siteName?: string;
    image?: string | null;
  },
): BookmarkShape {
  return {
    kind: 'bookmark',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    url: input.url,
    title: input.title ?? '',
    description: input.description ?? '',
    siteName: input.siteName ?? '',
    image: input.image ?? null,
    ...resolveBaseStyle(input),
    // A card around someone else's page: no fill or stroke of its own for the
    // properties panel to offer controls for.
    fillColor: null,
    strokeWidth: 1,
  };
}

export function bookmarkBounds(s: BookmarkShape): Rect {
  return { x: s.x, y: s.y, width: s.width, height: s.height };
}
