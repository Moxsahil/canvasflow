/**
 * The pictures on the local board, kept in this browser's IndexedDB.
 *
 * The local board has no server to upload to, so the bytes an account's board
 * would send to storage are kept here instead, keyed by the same content-hash
 * file id the image shape carries. One database for the one local board: the
 * same picture placed twice is stored once, as it is on the server.
 *
 * Stored as Blobs, which IndexedDB keeps as files rather than copying into the
 * database row, so a large photo costs no more than its own size.
 */

const DB_NAME = 'canvasflow:local-images';
const STORE = 'files';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open image storage'));
  }).catch((error: unknown) => {
    // Private browsing and blocked storage refuse to open. Forgotten, so the
    // next image tries again rather than inheriting this failure for good.
    opening = null;
    throw error;
  });
  return opening;
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Image storage failed'));
  });
}

export async function saveLocalImage(
  fileId: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<void> {
  const db = await open();
  const blob = new Blob([bytes.slice()], { type: mimeType });
  await settle(db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, fileId));
}

/** The bytes for one picture, or null if this browser has none for it. */
export async function readLocalImage(fileId: string): Promise<Blob | null> {
  const db = await open();
  const found: unknown = await settle(db.transaction(STORE).objectStore(STORE).get(fileId));
  return found instanceof Blob ? found : null;
}
