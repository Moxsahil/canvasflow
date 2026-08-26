import { env } from '../lib/env';

/**
 * Transport for image bytes.
 *
 * Separate from the API helpers the rest of the editor uses because these two
 * calls are the only ones that move a payload rather than a document: the
 * upload carries base64 and the download returns a blob, neither of which fits
 * a JSON-in/JSON-out helper.
 */

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageUploadError';
  }
}

function imagesUrl(boardId: string, fileId?: string): string {
  const base = `${env.VITE_API_URL}/boards/${boardId}/images`;
  return fileId ? `${base}/${fileId}` : base;
}

/**
 * Base64 for a byte array, chunked.
 *
 * `String.fromCharCode(...bytes)` on a multi-megabyte array overflows the
 * argument limit and throws, so the string is built in slices small enough to
 * spread safely.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function uploadImage(
  boardId: string,
  token: string,
  fileId: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(imagesUrl(boardId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fileId, data: toBase64(bytes) }),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new ImageUploadError(await failureMessage(response));
  }
}

/**
 * A message worth showing the person who picked the file.
 *
 * Only 4xx bodies are quoted. Those are our own deliberate refusals — too
 * large, wrong format, not your board — and each tells the user something they
 * can act on. A 5xx body is whatever the server happened to throw, which has
 * been known to be a raw Postgres string; it names an internal detail the user
 * cannot do anything about and should not be reading.
 */
async function failureMessage(response: Response): Promise<string> {
  if (response.status >= 500) {
    return "That image couldn't be saved. The board is still fine — try again in a moment.";
  }
  const detail = await response
    .json()
    .then((body: { message?: string }) => body?.message)
    .catch(() => undefined);
  return typeof detail === 'string' && detail ? detail : `Upload failed (${response.status})`;
}

/**
 * The bytes for one image, or null if the server doesn't have them yet.
 *
 * A 404 is a normal, temporary answer rather than an error: a collaborator can
 * see the shape the instant it is drawn, which is before the uploading client
 * has finished sending it. Returning null lets the cache try again later, while
 * a genuine failure throws and marks the image broken.
 */
export async function downloadImage(
  boardId: string,
  token: string,
  fileId: string,
): Promise<Blob | null> {
  const response = await fetch(imagesUrl(boardId, fileId), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not load image ${fileId} (${response.status})`);
  }
  return response.blob();
}
