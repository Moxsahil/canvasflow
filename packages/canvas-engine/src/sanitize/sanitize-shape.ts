import {
  createArrow,
  createDiamond,
  createEllipse,
  createFrame,
  createFreehand,
  createImage,
  createLine,
  createRectangle,
  createText,
} from '../shapes/index.js';
import { isSupportedImageMimeType } from '../images/image-formats.js';
import {
  createBookmark,
  MAX_BOOKMARK_DESCRIPTION,
  MAX_BOOKMARK_SITE_NAME,
  MAX_BOOKMARK_TITLE,
  readBookmarkText,
  readBookmarkUrl,
  readPreviewImageName,
} from '../shapes/bookmark.js';
import { createEmbed, resolveEmbed } from '../shapes/embed.js';
import { createTopic, readMapLayout, readMapLines, readTopicLook } from '../shapes/topic.js';
import { readLink } from '../shapes/link.js';
import type { Shape } from '../shapes/shape.js';

/**
 * Rebuilds shapes from untrusted JSON.
 *
 * Nothing from outside is used as-is: each candidate is picked apart field by
 * field and passed back through the engine's own factories, so what reaches
 * the document is always a canonical shape with defaults filled in. Anything
 * that doesn't fit — a missing width, a string where a number belongs, an
 * object where text belongs — is dropped rather than repaired.
 *
 * The strictness is deliberate: an imported shape goes straight into the Yjs
 * document, which replicates to every collaborator and is persisted by the
 * sync server. A malformed shape isn't a local rendering glitch, it's one for
 * everyone in the room.
 *
 * Two boundaries rely on this, which is why it lives in the engine rather than
 * beside either of them: a board file someone opens, and the in-progress shape
 * a collaborator publishes over awareness. Both arrive as plain objects written
 * by something this process does not control.
 */

const FILL_STYLES = ['hachure', 'cross-hatch', 'solid'] as const;
const STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const;
const EDGES = ['sharp', 'round'] as const;
const ARROW_TYPES = ['straight', 'curved', 'elbow'] as const;
const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
const ARROWHEADS = [
  'none',
  'arrow',
  'bar',
  'circle',
  'circle_outline',
  'triangle',
  'triangle_outline',
  'diamond',
  'diamond_outline',
] as const;

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined;
}

function roughness(value: unknown): 0 | 1 | 2 | undefined {
  return value === 0 || value === 1 || value === 2 ? value : undefined;
}

function opacity(value: unknown): number | undefined {
  const n = finite(value);
  return n === undefined ? undefined : Math.min(100, Math.max(0, n));
}

/**
 * A scale is a multiplier, so it has to be positive as well as finite: a zero
 * would collapse every stroke on the shape and a negative would invert it.
 * Anything else drops back to the factory default of none.
 */
function scale(value: unknown): number | undefined {
  const n = finite(value);
  return n !== undefined && n > 0 ? n : undefined;
}

/** `null` is meaningful here — it's "no fill" — so it survives the check. */
function fillColor(value: unknown): string | null | undefined {
  if (value === null) return null;
  return text(value);
}

function points(value: unknown): Array<[number, number]> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<[number, number]> = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length < 2) return undefined;
    const x = finite(point[0]);
    const y = finite(point[1]);
    if (x === undefined || y === undefined) return undefined;
    out.push([x, y]);
  }
  return out;
}

function baseStyle(raw: Raw) {
  return {
    strokeColor: text(raw.strokeColor),
    fillColor: fillColor(raw.fillColor),
    fillStyle: oneOf(raw.fillStyle, FILL_STYLES),
    strokeWidth: finite(raw.strokeWidth),
    strokeStyle: oneOf(raw.strokeStyle, STROKE_STYLES),
    roughness: roughness(raw.roughness),
    opacity: opacity(raw.opacity),
    rotation: finite(raw.rotation),
    seed: finite(raw.seed),
    scale: scale(raw.scale),
  };
}

export interface SanitizeOptions {
  /**
   * Images whose bytes travel with the shapes, by file id — a board file that
   * carries its pictures inside it. An image shape is kept only when its file
   * is here; see the `image` case below for why the rest are dropped.
   */
  imageFileIds?: ReadonlySet<string>;
}

/**
 * One shape, or `null` if the candidate can't be trusted.
 *
 * Ids are always regenerated: a file can carry ids that collide with each
 * other or with shapes already in the document, and either would corrupt the
 * board rather than merely look wrong.
 */
export function sanitizeShape(
  candidate: unknown,
  genId: () => string,
  options: SanitizeOptions = {},
): Shape | null {
  const shape = rebuildShape(candidate, genId, options);
  if (!shape) return null;
  // Every kind can carry a link and a lock, so both are read here once rather
  // than in each case below — the link through the same check the document
  // reads it with.
  const raw = candidate as Raw;
  const link = readLink(raw.link);
  return {
    ...shape,
    ...(link !== null && { link }),
    // A board file keeps what was locked or hidden on the board it came from.
    ...(raw.locked === true && { locked: true }),
    ...(raw.hidden === true && { hidden: true }),
  };
}

function rebuildShape(
  candidate: unknown,
  genId: () => string,
  options: SanitizeOptions,
): Shape | null {
  if (!isRecord(candidate)) return null;

  const x = finite(candidate.x);
  const y = finite(candidate.y);
  if (x === undefined || y === undefined) return null;

  const common = { id: genId(), x, y, ...baseStyle(candidate) };

  switch (candidate.kind) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond': {
      const width = finite(candidate.width);
      const height = finite(candidate.height);
      if (width === undefined || height === undefined) return null;
      const edges = oneOf(candidate.edges, EDGES);
      if (candidate.kind === 'ellipse') {
        return createEllipse({ ...common, width, height });
      }
      const create = candidate.kind === 'rectangle' ? createRectangle : createDiamond;
      return create({ ...common, width, height, edges });
    }

    case 'line':
    case 'arrow': {
      const pts = points(candidate.points);
      // The factories throw below two points rather than returning null, so
      // the length check has to happen here.
      if (!pts || pts.length < 2) return null;
      if (candidate.kind === 'line') {
        return createLine({ ...common, points: pts, edges: oneOf(candidate.edges, EDGES) });
      }
      return createArrow({
        ...common,
        points: pts,
        startArrowhead: oneOf(candidate.startArrowhead, ARROWHEADS),
        endArrowhead: oneOf(candidate.endArrowhead, ARROWHEADS),
        arrowType: oneOf(candidate.arrowType, ARROW_TYPES),
        label: text(candidate.label),
      });
    }

    case 'freehand': {
      const pts = points(candidate.points);
      if (!pts || pts.length === 0) return null;
      return createFreehand({
        ...common,
        points: pts,
        edges: oneOf(candidate.edges, EDGES),
        simulatePressure:
          typeof candidate.simulatePressure === 'boolean' ? candidate.simulatePressure : undefined,
      });
    }

    case 'text': {
      // Specifically not coerced with String(): a Y.Text or an object here
      // would stringify to garbage and poison the document.
      const value = text(candidate.text);
      if (value === undefined) return null;
      return createText({
        ...common,
        text: value,
        fontSize: finite(candidate.fontSize),
        fontFamily: text(candidate.fontFamily),
        textAlign: oneOf(candidate.textAlign, TEXT_ALIGNS),
      });
    }

    case 'topic': {
      const value = text(candidate.text);
      if (value === undefined) return null;
      // The parent is named by the id it had where it came from, which this
      // shape is about to lose. Kept as it was for the caller to point at the
      // parent's new id — see `relinkTopicParents` — and read as the centre
      // of a map of its own if it never is.
      const parentId = text(candidate.parentId);
      return createTopic({
        ...common,
        text: value,
        fontSize: finite(candidate.fontSize),
        fontFamily: text(candidate.fontFamily),
        parentId: parentId || null,
        side: candidate.side === 'left' ? 'left' : 'right',
        order: finite(candidate.order),
        collapsed: candidate.collapsed === true,
        mapLayout: readMapLayout(candidate.mapLayout),
        mapLines: readMapLines(candidate.mapLines),
        topicShape: readTopicLook(candidate.topicShape),
      });
    }

    case 'frame': {
      const width = finite(candidate.width);
      const height = finite(candidate.height);
      if (width === undefined || height === undefined) return null;
      // `frameId` is not read from the file at all. Every shape is given a
      // fresh id on the way in, so a stored one would point at nothing —
      // and it does not need to, because membership is derived from where
      // the shapes are. It is recomputed once the whole file has landed.
      return createFrame({
        ...common,
        width,
        height,
        name: typeof candidate.name === 'string' ? candidate.name : '',
      });
    }

    case 'image': {
      // An image shape carries only the id of bytes held on the board it came
      // from. Unless the file brought those bytes along, restoring the shape
      // would place a grey box that can never resolve, so it is dropped and
      // the caller counts it as skipped — the loss reported rather than
      // discovered later.
      const fileId = typeof candidate.fileId === 'string' ? candidate.fileId : undefined;
      if (fileId === undefined || !options.imageFileIds?.has(fileId)) return null;
      const width = finite(candidate.width);
      const height = finite(candidate.height);
      const naturalWidth = finite(candidate.naturalWidth);
      const naturalHeight = finite(candidate.naturalHeight);
      const mimeType = typeof candidate.mimeType === 'string' ? candidate.mimeType : undefined;
      if (
        width === undefined ||
        height === undefined ||
        naturalWidth === undefined ||
        naturalHeight === undefined ||
        mimeType === undefined ||
        !isSupportedImageMimeType(mimeType)
      ) {
        return null;
      }
      return createImage({
        ...common,
        width,
        height,
        fileId,
        mimeType,
        naturalWidth,
        naturalHeight,
        // Whatever the file says, these bytes are not on this board yet.
        // Whoever opens it uploads them, and the status follows.
        status: 'pending',
        ...(candidate.flipX === true && { flipX: true }),
        ...(candidate.flipY === true && { flipY: true }),
      });
    }

    case 'embed': {
      // Unlike on a board, an address nothing would embed is dropped here: a
      // file is read once, and a card that can never show its page is better
      // reported as skipped than placed.
      const width = finite(candidate.width);
      const height = finite(candidate.height);
      if (width === undefined || height === undefined) return null;
      const embed = resolveEmbed(candidate.url);
      if (!embed) return null;
      return createEmbed({
        ...common,
        width,
        height,
        url: embed.url,
        title: readBookmarkText(candidate.title, MAX_BOOKMARK_TITLE),
        poster: readPreviewImageName(candidate.poster),
      });
    }

    case 'bookmark': {
      const width = finite(candidate.width);
      const height = finite(candidate.height);
      const url = readBookmarkUrl(candidate.url);
      if (width === undefined || height === undefined || !url) return null;
      return createBookmark({
        ...common,
        width,
        height,
        url,
        title: readBookmarkText(candidate.title, MAX_BOOKMARK_TITLE),
        description: readBookmarkText(candidate.description, MAX_BOOKMARK_DESCRIPTION),
        siteName: readBookmarkText(candidate.siteName, MAX_BOOKMARK_SITE_NAME),
        image: readPreviewImageName(candidate.image),
      });
    }

    default:
      // Unknown kind — a shape type from a newer version, or not a shape.
      return null;
  }
}
