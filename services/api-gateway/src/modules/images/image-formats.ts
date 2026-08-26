/**
 * What the server will accept as an image, decided from the bytes themselves.
 *
 * Deliberately its own list rather than one shared with the editor: this is a
 * trust boundary, and the point of validating here is precisely that the
 * client's opinion — its `Content-Type`, its filename, its declared mime — is
 * not evidence. A client that lies gets rejected; a client that is merely out
 * of date gets a clear error instead of a stored file nothing can render.
 */

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/apng',
  'image/bmp',
  'image/x-icon',
  'image/avif',
  'image/svg+xml',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Must match the editor's cap; a mismatch shows up as a confusing late failure. */
export const MAX_STORED_IMAGE_BYTES = 3 * 1024 * 1024;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function hasAscii(bytes: Uint8Array, text: string, offset: number): boolean {
  return startsWith(
    bytes,
    Array.from(text, (char) => char.charCodeAt(0)),
    offset,
  );
}

/**
 * The format these bytes actually are, or null if it isn't one we allow.
 *
 * Sniffing rather than trusting the declared type does two jobs at once. It
 * stops a file being stored under a mime type that would make the browser treat
 * it as something else on the way back out, and it quietly fixes the ordinary
 * case of an image whose extension simply doesn't match its contents.
 */
export function sniffImageMimeType(bytes: Uint8Array): AllowedImageMimeType | null {
  // PNG and APNG share a signature and differ only by an `acTL` chunk. Both are
  // painted as a still, so telling them apart would change nothing.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(bytes, [0x42, 0x4d])) return 'image/bmp';
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon';

  // RIFF container: bytes 0-3 "RIFF", 8-11 name the payload.
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && hasAscii(bytes, 'WEBP', 8)) {
    return 'image/webp';
  }

  // ISO base media container: a size prefix, then "ftyp", then the brand.
  if (hasAscii(bytes, 'ftyp', 4) && (hasAscii(bytes, 'avif', 8) || hasAscii(bytes, 'avis', 8))) {
    return 'image/avif';
  }

  if (looksLikeSvg(bytes)) return 'image/svg+xml';

  return null;
}

/**
 * SVG is text, so it has no signature to match — the best available test is
 * that an `<svg` tag appears near the start, after any XML declaration,
 * doctype, comment or leading whitespace. Bounded to the opening bytes so a
 * large binary file that happens to contain the string somewhere isn't
 * mistaken for one.
 */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('utf8').toLowerCase();
  const tag = head.indexOf('<svg');
  if (tag === -1) return false;

  // Anything before the tag must be prologue, not content.
  const before = head.slice(0, tag);
  return !/<(?!\?|!)/.test(before);
}
