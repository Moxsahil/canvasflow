import { env } from '../lib/env';

/**
 * Transport for image bytes.
 *
 * Uploads go in two steps. The API is asked to authorize one — it checks the
 * board, then signs a URL — and the bytes are then PUT straight to object
 * storage. Nothing large passes through our own server in either direction:
 * the download route redirects rather than proxies, and `fetch` follows that
 * without the caller noticing.
 *
 * The split exists for cost as much as for load. Bytes that pass through a
 * server are paid for twice, and the previous version of this file sent them
 * through the API and into Postgres, where every view of every image was
 * charged against the database's transfer budget.
 */

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageUploadError';
  }
}

function imagesUrl(boardId: string, path?: string): string {
  const base = `${env.VITE_API_URL}/boards/${boardId}/images`;
  return path ? `${base}/${path}` : base;
}

interface PresignedUpload {
  url: string;
  /** Sent verbatim: they are part of the signature, not decoration. */
  headers: Record<string, string>;
}

export async function uploadImage(
  boardId: string,
  token: string,
  fileId: string,
  mimeType: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  const authorization = await fetch(imagesUrl(boardId, 'upload-url'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fileId, mimeType, sizeBytes: bytes.length }),
    ...(signal ? { signal } : {}),
  });

  if (!authorization.ok) {
    throw new ImageUploadError(await failureMessage(authorization));
  }

  const { data } = (await authorization.json()) as { data: PresignedUpload };

  const upload = await fetch(data.url, {
    method: 'PUT',
    headers: data.headers,
    // A view of the exact bytes, not a copy: `bytes` may be a subarray of a
    // larger buffer, and sending the whole buffer would fail the length the
    // signature pins.
    body: bytes.slice().buffer as ArrayBuffer,
    ...(signal ? { signal } : {}),
  });

  if (!upload.ok) {
    // The body here is the storage provider's XML, which is no use to anyone
    // looking at a canvas. The status is the only part worth keeping.
    throw new ImageUploadError(
      `That image couldn't be uploaded (${upload.status}). Try again in a moment.`,
    );
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
 *
 * Two steps, for the same reason the upload is. The API answers with a signed
 * URL and the bytes are then read straight from storage, so nothing large
 * passes through our own server.
 *
 * It has to be two requests rather than a redirect. Following a cross-origin
 * redirect makes the browser send `Origin: null`, which the bucket does not
 * recognise, so it withholds the CORS header and the response — a perfectly
 * good 200 — becomes unreadable to script. Asking for the URL and fetching it
 * ourselves keeps the real origin on the request.
 */
export async function downloadImage(
  boardId: string,
  token: string,
  fileId: string,
): Promise<Blob | null> {
  const authorization = await fetch(imagesUrl(boardId, `${fileId}/url`), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (authorization.status === 404) return null;
  if (!authorization.ok) {
    throw new Error(`Could not load image ${fileId} (${authorization.status})`);
  }

  const { data } = (await authorization.json()) as { data: { url: string } };

  const bytes = await fetch(data.url);
  if (bytes.status === 404) return null;
  if (!bytes.ok) {
    throw new Error(`Could not read image ${fileId} from storage (${bytes.status})`);
  }
  return bytes.blob();
}
