import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_STORED_IMAGE_BYTES,
  isSupportedImageMimeType,
  isVectorImageMimeType,
  decodeBlob,
} from '@canvasflow/canvas-engine';

/**
 * Turning a file the user picked into something a board can hold.
 *
 * Three things happen here, in an order that matters: the file is checked, then
 * shrunk if it is larger than any board will ever display it, and only then
 * hashed. Hashing last means the id names the bytes we actually store, so a
 * `fileId` and the payload behind it can never disagree.
 */

export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageRejectedError';
  }
}

export interface PreparedImage {
  /** Lowercase hex SHA-256 of `bytes`. */
  fileId: string;
  bytes: Uint8Array;
  mimeType: string;
  /** Already decoded, so the shape can be painted without a round trip. */
  bitmap: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Redraw an image at no more than `MAX_IMAGE_DIMENSION` on its longer side.
 *
 * Returns null when the original is already small enough, so the common case
 * costs nothing and the bytes stay exactly as the user's file had them —
 * re-encoding a small PNG would only lose quality and change its hash.
 */
async function downscale(
  bitmap: HTMLImageElement,
  mimeType: string,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const longest = Math.max(bitmap.naturalWidth, bitmap.naturalHeight);
  if (longest <= MAX_IMAGE_DIMENSION) return null;

  const scale = MAX_IMAGE_DIMENSION / longest;
  const width = Math.round(bitmap.naturalWidth * scale);
  const height = Math.round(bitmap.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  // PNG for anything with transparency, JPEG otherwise: re-encoding a photo as
  // PNG can make it larger than the original it was meant to shrink.
  const outputType = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, 0.85);
  });

  return blob ? { blob, width, height } : null;
}

/**
 * Validate, shrink and hash one picked file.
 *
 * Throws {@link ImageRejectedError} with a message meant to be shown to the
 * user — every rejection here is something they can act on by choosing a
 * different file.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!isSupportedImageMimeType(file.type)) {
    throw new ImageRejectedError(
      file.type
        ? `${file.type} isn't an image format we can place on a board.`
        : "That file doesn't look like an image.",
    );
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImageRejectedError(
      `That image is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_IMAGE_UPLOAD_BYTES)}.`,
    );
  }

  let blob: Blob = file;
  let mimeType = file.type;
  let bitmap = await decodeBlob(blob).catch(() => {
    throw new ImageRejectedError("That image couldn't be read — it may be damaged.");
  });

  // Vectors are resolution-independent, so shrinking one would throw away the
  // only property that makes it worth being a vector.
  if (!isVectorImageMimeType(mimeType)) {
    const smaller = await downscale(bitmap, mimeType);
    if (smaller) {
      blob = smaller.blob;
      mimeType = smaller.blob.type || mimeType;
      bitmap = await decodeBlob(blob);
    }
  }

  if (blob.size > MAX_STORED_IMAGE_BYTES) {
    throw new ImageRejectedError(
      `That image is still ${formatBytes(blob.size)} after resizing — the limit is ${formatBytes(
        MAX_STORED_IMAGE_BYTES,
      )}.`,
    );
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

  return {
    fileId: await sha256Hex(bytes),
    bytes,
    mimeType,
    bitmap,
    // An SVG with no intrinsic size decodes to 0×0 in some browsers and to a
    // 300×150 default in others. Neither is the drawing's shape, so fall back
    // to a square and let the user resize rather than placing a sliver.
    naturalWidth: bitmap.naturalWidth || MAX_IMAGE_DIMENSION / 4,
    naturalHeight: bitmap.naturalHeight || MAX_IMAGE_DIMENSION / 4,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
