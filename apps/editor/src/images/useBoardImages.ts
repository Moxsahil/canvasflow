import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ImageCache,
  createImage,
  fitPlacedImageSize,
  isImage,
  type BoardDocument,
  type ImageStatus,
  type Shape,
} from '@canvasflow/canvas-engine';
import { downloadImage, uploadImage } from './image-client';
import { ImageRejectedError, prepareImage } from './prepare-image';
import type { Point } from '../machine/tool-machine.types';

/**
 * Everything about getting images onto a board and keeping them there.
 *
 * The flow is deliberately optimistic. Because a file's id is a hash of its own
 * bytes, it can be computed before the upload starts — so the shape goes onto
 * the canvas immediately, painted from the bitmap already in hand, and the
 * upload catches up behind it. Nothing is ever rewritten: the id the shape is
 * born with is the id it keeps, and the only thing that changes when the upload
 * lands is a single status field.
 *
 * That status is what other people are waiting on. A collaborator receives the
 * shape as soon as it is drawn, which is before its bytes exist anywhere they
 * can reach. `pending` tells them not to bother asking yet; `saved` tells them
 * the fetch will succeed. Without it, every image would be requested once,
 * 404, and be marked broken a moment before it became available.
 */

/** Gap between images when several are placed at once. */
const MULTI_INSERT_GAP = 16;

/**
 * Set the status of every shape backed by this file.
 *
 * Every shape, because a content hash is shared: the same picture placed three
 * times is three shapes over one upload, and all three succeed or fail
 * together. A no-op when nothing needs changing, so it is safe to call from a
 * fetch callback without stirring the document on every load.
 */
function setImageStatus(doc: BoardDocument, fileId: string, status: ImageStatus): void {
  for (const shape of doc.getShapes()) {
    if (isImage(shape) && shape.fileId === fileId && shape.status !== status) {
      doc.updateShape(shape.id, { status } as Partial<Shape>);
    }
  }
}

interface UseBoardImagesOptions {
  boardId: string;
  doc: BoardDocument;
  shapes: readonly Shape[];
  /** Null while the token is being minted or refreshed. */
  token: string | null;
  /** Viewers may see images but never add them. */
  canEdit: boolean;
  onError: (message: string) => void;
}

export interface BoardImages {
  /** Decoded bitmaps, handed to the renderers. */
  cache: ImageCache;
  /** Bumped whenever a decode finishes, so a repaint can be triggered. */
  revision: number;
  /** Place these files as image shapes, centred on `at`. */
  insertFiles: (files: readonly File[], at: Point) => Promise<void>;
  /** True while at least one upload is in flight. */
  isUploading: boolean;
  /** Original bytes as data URIs, for embedding in an SVG export. */
  resolveDataUrls: (shapes: readonly Shape[]) => Promise<ReadonlyMap<string, string>>;
}

export function useBoardImages({
  boardId,
  doc,
  shapes,
  token,
  canEdit,
  onError,
}: UseBoardImagesOptions): BoardImages {
  const [revision, setRevision] = useState(0);
  const [uploadCount, setUploadCount] = useState(0);

  // Read through a ref so a token refresh doesn't rebuild the cache and throw
  // away every bitmap already decoded.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const docRef = useRef(doc);
  docRef.current = doc;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const cache = useMemo(
    () =>
      new ImageCache({
        fetch: async (fileId) => {
          const current = tokenRef.current;
          // No token yet is the same situation as no bytes yet: not an error,
          // just not now. Returning null leaves the id untracked so the next
          // pass retries once the token arrives.
          if (!current) return null;
          return downloadImage(boardId, current, fileId);
        },
        onError: (fileId) => {
          // Marking the shape rather than only the cache is what makes the
          // failure visible to everyone, and stops each client rediscovering
          // it separately on every load.
          setImageStatus(docRef.current, fileId, 'error');
        },
        onLoaded: (fileId) => {
          // The bytes are demonstrably there, so any shape still carrying an
          // error from an earlier failure is now simply wrong. Correcting it
          // is what lets a board recover from a transient outage instead of
          // keeping a broken box forever.
          setImageStatus(docRef.current, fileId, 'saved');
        },
      }),
    [boardId],
  );

  useEffect(() => cache.subscribe(() => setRevision((n) => n + 1)), [cache]);

  /**
   * Ids in a non-`saved` state that this session has already probed once.
   *
   * Both other states get stuck without this. A shape stays `pending` forever
   * if the client adding it closed the tab mid-upload — nobody is left to flip
   * it and nobody ever asks for it. A shape marked `error` stays that way even
   * after whatever broke has been fixed, because nothing retries a failure.
   *
   * One probe per session settles both: if the bytes are there the image
   * appears and its status is corrected, and if they are genuinely gone it
   * stays a placeholder without costing a request per shape change. An image
   * that really is mid-upload is picked up a moment later by the `saved` path.
   */
  const probedUnsaved = useRef(new Set<string>());

  // Runs on every shape change, which is cheap: ids already decoded, in flight,
  // or known bad are skipped inside the cache.
  useEffect(() => {
    const wanted: string[] = [];
    for (const shape of shapes) {
      if (!isImage(shape) || cache.has(shape.fileId)) continue;

      if (shape.status === 'saved') {
        wanted.push(shape.fileId);
        continue;
      }
      if (!probedUnsaved.current.has(shape.fileId)) {
        probedUnsaved.current.add(shape.fileId);
        wanted.push(shape.fileId);
      }
    }
    if (wanted.length > 0) cache.ensure(wanted);
  }, [shapes, cache, token]);

  const insertFiles = useCallback(
    async (files: readonly File[], at: Point) => {
      if (files.length === 0) return;
      if (!canEdit) return;

      const currentToken = tokenRef.current;
      if (!currentToken) {
        onErrorRef.current('Still connecting — try adding that image again in a moment.');
        return;
      }

      // Prepared in parallel, but placed in the order they were picked so the
      // arrangement matches what the user selected.
      const prepared = await Promise.all(
        files.map(async (file) => {
          try {
            return await prepareImage(file);
          } catch (error) {
            onErrorRef.current(
              error instanceof ImageRejectedError
                ? error.message
                : `Couldn't read ${file.name || 'that image'}.`,
            );
            return null;
          }
        }),
      );

      const usable = prepared.filter((item) => item !== null);
      if (usable.length === 0) return;

      const sizes = usable.map((item) => fitPlacedImageSize(item.naturalWidth, item.naturalHeight));
      const totalWidth =
        sizes.reduce((sum, size) => sum + size.width, 0) + MULTI_INSERT_GAP * (sizes.length - 1);

      let cursorX = at.x - totalWidth / 2;

      const placed = usable.map((item, index) => {
        const size = sizes[index]!;
        const shape = createImage({
          id: crypto.randomUUID(),
          x: cursorX,
          y: at.y - size.height / 2,
          width: size.width,
          height: size.height,
          fileId: item.fileId,
          mimeType: item.mimeType,
          naturalWidth: item.naturalWidth,
          naturalHeight: item.naturalHeight,
          status: 'pending',
        });
        cursorX += size.width + MULTI_INSERT_GAP;

        // Seeded before the shape is added, so the very first paint after the
        // document changes already has pixels rather than a placeholder.
        cache.put(item.fileId, item.bitmap);
        docRef.current.addShape(shape);
        return { shape, item };
      });

      setUploadCount((n) => n + placed.length);

      await Promise.all(
        placed.map(async ({ shape, item }) => {
          try {
            await uploadImage(boardId, currentToken, item.fileId, item.bytes);
            // The one field that changes after insert, and the signal every
            // other client is waiting for.
            docRef.current.updateShape(shape.id, { status: 'saved' } as Partial<Shape>);
          } catch (error) {
            docRef.current.updateShape(shape.id, { status: 'error' } as Partial<Shape>);
            onErrorRef.current(
              error instanceof Error ? error.message : "That image couldn't be uploaded.",
            );
          } finally {
            setUploadCount((n) => n - 1);
          }
        }),
      );
    },
    [boardId, cache, canEdit],
  );

  /**
   * Data URIs for the images among these shapes, keyed by file id.
   *
   * Refetches the stored bytes rather than re-encoding what the cache holds.
   * The cache holds decoded bitmaps, and drawing one back out to a canvas would
   * rasterize an SVG and re-compress a JPEG — turning an export meant to
   * preserve the drawing into a lossy copy of it. Anything that can't be
   * resolved is simply absent, and the renderer draws an outline in its place.
   */
  const resolveDataUrls = useCallback(
    async (subject: readonly Shape[]): Promise<ReadonlyMap<string, string>> => {
      const currentToken = tokenRef.current;
      const resolved = new Map<string, string>();
      if (!currentToken) return resolved;

      const fileIds = [...new Set(subject.filter(isImage).map((shape) => shape.fileId))];

      await Promise.all(
        fileIds.map(async (fileId) => {
          try {
            const blob = await downloadImage(boardId, currentToken, fileId);
            if (!blob) return;
            resolved.set(fileId, await blobToDataUrl(blob));
          } catch {
            // An image that won't resolve exports as an outline. Failing the
            // whole export over one of them would be the worse trade.
          }
        }),
      );

      return resolved;
    },
    [boardId],
  );

  return { cache, revision, insertFiles, isUploading: uploadCount > 0, resolveDataUrls };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not encode image'));
    reader.readAsDataURL(blob);
  });
}
