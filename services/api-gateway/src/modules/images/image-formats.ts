/**
 * What the server will authorize an upload for.
 *
 * Deliberately its own list rather than one shared with the editor: this is a
 * trust boundary, and a client that is merely out of date should get a clear
 * refusal rather than a stored file nothing can render.
 *
 * This used to be decided by sniffing the bytes, back when uploads passed
 * through this process. They no longer do — the browser sends them straight to
 * object storage — so the declared type is all there is to check. What stops
 * that being a hole is the signature the type is baked into: the same value is
 * pinned as the stored `Content-Type` and as the `Content-Type` served back,
 * and the download URL also pins `inline` disposition. A file whose contents
 * disagree with its declared type is therefore inert rather than dangerous; it
 * simply fails to decode in the `<img>` that is the only thing ever pointed at
 * it.
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

export function isAllowedImageMimeType(type: string): type is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * Largest object we will authorize, after the client has downscaled.
 *
 * Must match the editor's cap; a mismatch shows up as a confusing late failure
 * where the browser accepts a file and the upload URL is then refused.
 */
export const MAX_STORED_IMAGE_BYTES = 10 * 1024 * 1024;
