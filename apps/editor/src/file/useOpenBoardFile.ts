import { useCallback, useState, type MutableRefObject } from 'react';
import type { BoardDocument, Shape } from '@canvasflow/canvas-engine';
import { BoardFileError, parseBoardFile, parseImageFile, type ParsedBoardFile } from './board-file';
import { unpackImages, type CarriedImage } from './embedded-images';
import { pickBoardFile } from './pick-file';
import { track } from '../analytics/analytics';
import { t } from '../i18n';

interface PendingReplace {
  fileName: string;
  parsed: ParsedBoardFile;
  /** The pictures the file carried, uploaded once the board is replaced. */
  images: ReadonlyMap<string, CarriedImage>;
  /** Only set for our own format — see the assignment in `apply`. */
  handle: FileSystemFileHandle | null;
}

interface UseOpenBoardFileOptions {
  doc: BoardDocument;
  /** How many shapes the board holds now — an empty board skips the confirm. */
  shapeCount: number;
  genId: () => string;
  /** Called once the board has been replaced, to fit the camera to it. */
  onLoaded: (shapes: readonly Shape[]) => void;
  /** Uploads the images a file carried, whose shapes have just been placed. */
  adoptImages: (images: ReadonlyMap<string, CarriedImage>) => Promise<void>;
  /**
   * The file this board is associated with, shared with the save flow so a
   * board opened from disk saves straight back to the same file.
   */
  fileHandleRef: MutableRefObject<FileSystemFileHandle | null>;
  onNotice: (message: string) => void;
}

interface OpenBoardFile {
  /** Runs the picker. Must be called from a user gesture. */
  openBoardFile: () => void;
  /** Set while waiting on the replace confirmation. */
  pendingReplace: PendingReplace | null;
  confirmReplace: () => void;
  cancelReplace: () => void;
}

function describeLoad({ shapes, skipped }: ParsedBoardFile, fileName: string): string {
  const loaded = t('file.loaded', { count: shapes.length, fileName });
  if (skipped === 0) return loaded;
  // Images and frames are the usual cause — the adapter has no equivalent for
  // them — so the count is reported rather than silently swallowed.
  return `${loaded} ${t('file.skipped', { count: skipped })}`;
}

/**
 * The Open flow: pick a file, parse it, confirm the replacement, swap the
 * board's contents.
 *
 * The confirm isn't a formality. This board is live-synced, so replacing it
 * replaces what every other person in the room is looking at — hence one
 * `replaceShapes` transaction, which lands as a single undo step that also
 * replicates, so a mistaken open is one ⌘Z away for whoever made it.
 */
export function useOpenBoardFile({
  doc,
  shapeCount,
  genId,
  onLoaded,
  adoptImages,
  fileHandleRef,
  onNotice,
}: UseOpenBoardFileOptions): OpenBoardFile {
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(null);

  const apply = useCallback(
    ({ parsed, images, fileName, handle }: PendingReplace) => {
      doc.replaceShapes(parsed.shapes);
      doc.breakUndoGroup();
      void adoptImages(images);
      track('board_file_opened', { format: parsed.format, images: images.size });

      fileHandleRef.current = handle;
      onLoaded(parsed.shapes);
      if (parsed.skipped > 0) {
        onNotice(describeLoad(parsed, fileName));
      }
    },
    [adoptImages, doc, fileHandleRef, onLoaded, onNotice],
  );

  const openBoardFile = useCallback(() => {
    void (async () => {
      try {
        const file = await pickBoardFile();
        if (!file) return;

        // A PNG arrives as bytes, and an SVG is text that isn't JSON: both
        // are only openable when they carry an embedded scene.
        const isImage =
          file.bytes !== undefined || /\.svg$/i.test(file.name) || /\.png$/i.test(file.name);
        const read = isImage ? parseImageFile(file, genId) : parseBoardFile(file.text, genId);
        const { parsed, images } = await unpackImages(read);
        if (parsed.shapes.length === 0) {
          onNotice(t('file.nothingToOpen', { fileName: file.name }));
          return;
        }

        const handle = parsed.format === 'canvasflow' ? (file.handle ?? null) : null;

        const pending = { fileName: file.name, parsed, images, handle };
        if (shapeCount === 0) {
          apply(pending);
        } else {
          setPendingReplace(pending);
        }
      } catch (error) {
        onNotice(error instanceof BoardFileError ? error.message : t('file.openFailed'));
      }
    })();
  }, [apply, genId, onNotice, shapeCount]);

  const confirmReplace = useCallback(() => {
    if (!pendingReplace) return;
    apply(pendingReplace);
    setPendingReplace(null);
  }, [apply, pendingReplace]);

  const cancelReplace = useCallback(() => setPendingReplace(null), []);

  return { openBoardFile, pendingReplace, confirmReplace, cancelReplace };
}
