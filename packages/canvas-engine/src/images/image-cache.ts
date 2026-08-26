import type { ImageSource } from '../renderers/draw-image.js';

/**
 * Decoded bitmaps, keyed by the content hash on the shape.
 *
 * This is the third tier of the image story, and the only one that is purely
 * derived: the shape (synced) points at bytes (fetched over HTTP), and this
 * holds what the browser made of those bytes. Losing it costs a redecode and
 * nothing else, so it is never persisted and never enters the document.
 *
 * It exists because the renderers are synchronous. Every canvas layer is a full
 * repaint driven by an effect, with no frame loop to poll from, so a decode
 * finishing has to actively say so — hence the subscription. Decoding is
 * deduplicated by file id, which also means the same picture placed ten times
 * is fetched and decoded once.
 */

/**
 * Fetches the bytes behind a file id, or resolves null if there are none yet.
 *
 * A fetcher rather than a URL because the bytes come from an endpoint that
 * requires an `Authorization` header, and an `<img src>` cannot send one. The
 * transport and its auth stay in the app; this module only decodes.
 */
export type ImageFetcher = (fileId: string) => Promise<Blob | null>;

export interface ImageCacheOptions {
  fetch: ImageFetcher;
  /** Called with ids whose fetch failed, so their shapes can be marked broken. */
  onError?: (fileId: string) => void;
  /**
   * Called when a fetch succeeds. Lets a caller correct a shape that was marked
   * broken by a failure that has since resolved itself.
   */
  onLoaded?: (fileId: string) => void;
}

export class ImageCache implements ImageSource {
  private readonly decoded = new Map<string, HTMLImageElement>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly failed = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly fetchBytes: ImageFetcher;
  private readonly onError: ((fileId: string) => void) | undefined;
  private readonly onLoaded: ((fileId: string) => void) | undefined;

  constructor(options: ImageCacheOptions) {
    this.fetchBytes = options.fetch;
    this.onError = options.onError;
    this.onLoaded = options.onLoaded;
  }

  /** The bitmap for this id if it is decoded, else null. Never throws, never waits. */
  get(fileId: string): HTMLImageElement | null {
    return this.decoded.get(fileId) ?? null;
  }

  has(fileId: string): boolean {
    return this.decoded.has(fileId);
  }

  hasFailed(fileId: string): boolean {
    return this.failed.has(fileId);
  }

  /**
   * Put an already-decoded bitmap in directly.
   *
   * The client that just picked the file has it in hand. Seeding the cache from
   * there means its own image is on the canvas immediately, rather than after a
   * round trip to fetch back bytes it is still in the middle of uploading.
   */
  put(fileId: string, image: HTMLImageElement): void {
    this.decoded.set(fileId, image);
    this.failed.delete(fileId);
    this.inFlight.delete(fileId);
    this.notify();
  }

  /**
   * Ensure every one of these ids is decoded, fetching what is missing.
   *
   * Safe to call on every render: ids already decoded, in flight, or known bad
   * are skipped, so the steady state is a set lookup per shape. Failures are
   * not retried on their own — a caller wanting another attempt says so with
   * {@link forget}, which keeps a broken image from becoming a request loop.
   */
  ensure(fileIds: Iterable<string>): void {
    for (const fileId of fileIds) {
      if (this.decoded.has(fileId) || this.inFlight.has(fileId) || this.failed.has(fileId)) {
        continue;
      }
      this.inFlight.set(fileId, this.load(fileId));
    }
  }

  private async load(fileId: string): Promise<void> {
    try {
      const blob = await this.fetchBytes(fileId);
      // Null means "not there yet" rather than "not there" — the uploader may
      // still be in flight. Leaving it untracked lets the next ensure() retry,
      // which is what makes an image appear once its bytes land.
      if (blob === null) {
        this.inFlight.delete(fileId);
        return;
      }

      const image = await decodeBlob(blob);
      // A forget() between the request going out and it coming back means the
      // caller stopped caring; writing the result now would resurrect an entry
      // it deliberately dropped.
      if (this.inFlight.has(fileId)) {
        this.decoded.set(fileId, image);
        this.onLoaded?.(fileId);
      }
    } catch {
      this.failed.add(fileId);
      this.onError?.(fileId);
    } finally {
      this.inFlight.delete(fileId);
      this.notify();
    }
  }

  /** Drop what is known about these ids, so the next `ensure` fetches again. */
  forget(fileIds: Iterable<string>): void {
    for (const fileId of fileIds) {
      this.decoded.delete(fileId);
      this.inFlight.delete(fileId);
      this.failed.delete(fileId);
    }
    this.notify();
  }

  /** Notified whenever the set of decoded images changes. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.decoded.clear();
    this.inFlight.clear();
    this.failed.clear();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Decode a blob into a paintable image element.
 *
 * The object URL is revoked as soon as the bitmap is decoded: the element holds
 * the decoded pixels from that point on, so keeping the URL alive would pin the
 * blob in memory for the life of the board for no benefit.
 */
export async function decodeBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageElement(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load a URL into an image element.
 *
 * Awaits `decode()` rather than settling on the `load` event, so the promise
 * resolves only once the bitmap can actually be painted. Resolving on `load`
 * alone would hand the renderer an element that still blocks on first draw, and
 * a first frame that stutters is exactly what this cache exists to avoid.
 */
export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    const settle = () => {
      if (typeof image.decode === 'function') {
        image.decode().then(
          () => resolve(image),
          // Decode can reject where the load succeeded (Safari, detached
          // documents). The element is still paintable, so prefer it to failing.
          () => resolve(image),
        );
        return;
      }
      resolve(image);
    };

    image.addEventListener('load', settle, { once: true });
    image.addEventListener('error', () => reject(new Error(`Could not load image: ${url}`)), {
      once: true,
    });
    image.src = url;
  });
}
