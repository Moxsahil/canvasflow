/**
 * Which files may become an image on a board, and how large they may be.
 *
 * One list, shared by the picker's `accept`, the drop and paste filters, and
 * the upload endpoint's validation — a client-side check is a convenience that
 * tells the user early, never the thing that decides what gets stored.
 */

/** Rasters the browser decodes into a bitmap with no help from us. */
export const RASTER_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
  'image/x-icon',
  'image/avif',
] as const;

/**
 * Formats that carry more than one frame.
 *
 * Accepted and stored whole, but painted as their first frame: a 2D canvas has
 * no way to advance an animation, and every layer here repaints from scratch
 * rather than running a frame loop. Worth knowing about separately so the UI
 * can say so rather than letting it look like a bug.
 */
export const ANIMATED_IMAGE_MIME_TYPES = ['image/gif', 'image/apng'] as const;

/**
 * Vector formats.
 *
 * Never downscaled — resampling a vector throws away the only thing that makes
 * it a vector — and handled separately on the way out, since an SVG served
 * from our own origin needs headers a PNG does not.
 */
export const VECTOR_IMAGE_MIME_TYPES = ['image/svg+xml'] as const;

export const SUPPORTED_IMAGE_MIME_TYPES = [
  ...RASTER_IMAGE_MIME_TYPES,
  ...ANIMATED_IMAGE_MIME_TYPES,
  ...VECTOR_IMAGE_MIME_TYPES,
] as const;

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

/** Ready for an `<input accept>` or a file picker's type list. */
export const SUPPORTED_IMAGE_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',');

export function isSupportedImageMimeType(type: string | null | undefined): boolean {
  return !!type && (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

export function isVectorImageMimeType(type: string): boolean {
  return (VECTOR_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

export function isAnimatedImageMimeType(type: string): boolean {
  return (ANIMATED_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * Largest file we accept from the user, before downscaling.
 *
 * Matches the cap the board-file picker already applies, so "too big" means
 * one thing across the editor.
 */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Largest payload we will store, after downscaling.
 *
 * Lower than the accept limit because a photo that arrives at 8 MB should
 * leave the downscaler far smaller; anything still above this after resizing
 * is pathological rather than ordinary, and every board load pays for it.
 */
export const MAX_STORED_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * Longest edge, in pixels, that we keep.
 *
 * A phone camera produces images several times wider than any board is ever
 * viewed at, and the full resolution costs every collaborator a download they
 * cannot perceive. Resizing happens once, on the uploading client.
 */
export const MAX_IMAGE_DIMENSION = 1920;
