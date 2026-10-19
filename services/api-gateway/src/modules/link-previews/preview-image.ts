/**
 * Which pictures a preview keeps, told from their bytes rather than from what
 * the other site claimed they were.
 *
 * Only the four raster formats every browser draws. SVG is left out on
 * purpose: it is a document that can carry script, and this one would come
 * from a site nobody here chose.
 */

export interface PreviewImageFormat {
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  /** The extension the object is stored under, which is also how its type is read back. */
  readonly extension: 'png' | 'jpg' | 'gif' | 'webp';
  readonly width: number | null;
  readonly height: number | null;
}

export const PREVIEW_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

export const MIME_BY_EXTENSION: Readonly<Record<PreviewImageFormat['extension'], string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** An object name a preview picture is stored under: its hash and its extension. */
export const PREVIEW_IMAGE_NAME = /^[0-9a-f]{64}\.(png|jpg|gif|webp)$/;

export function previewImageKey(name: string): string {
  return `previews/${name}`;
}

/** Sizes past this are not a preview picture, or not one worth drawing. */
const MAX_SIDE = 16_384;

function sized(width: number, height: number): { width: number | null; height: number | null } {
  return width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE
    ? { width, height }
    : { width: null, height: null };
}

/** JPEG keeps its size in a start-of-frame segment somewhere after the header. */
function jpegSize(bytes: Buffer): { width: number | null; height: number | null } {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return sized(0, 0);
    const marker = bytes[offset + 1]!;
    const length = bytes.readUInt16BE(offset + 2);
    // SOF0–SOF15, less the ones that are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return sized(bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5));
    }
    offset += 2 + length;
  }
  return sized(0, 0);
}

function webpSize(bytes: Buffer): { width: number | null; height: number | null } {
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return sized(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return sized((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return sized(bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1);
  }
  return sized(0, 0);
}

/** The picture's format and size, or null when it is not one a preview keeps. */
export function sniffPreviewImage(bytes: Buffer): PreviewImageFormat | null {
  if (
    bytes.length >= 24 &&
    bytes.readUInt32BE(0) === 0x89504e47 &&
    bytes.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return {
      mimeType: 'image/png',
      extension: 'png',
      ...sized(bytes.readUInt32BE(16), bytes.readUInt32BE(20)),
    };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg', ...jpegSize(bytes) };
  }
  if (bytes.length >= 10 && bytes.toString('ascii', 0, 4) === 'GIF8') {
    return {
      mimeType: 'image/gif',
      extension: 'gif',
      ...sized(bytes.readUInt16LE(6), bytes.readUInt16LE(8)),
    };
  }
  if (
    bytes.length >= 16 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp', ...webpSize(bytes) };
  }
  return null;
}
