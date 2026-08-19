import { useCallback, useState, type MutableRefObject } from 'react';
import type { BoardDocument, Shape } from '@canvasflow/canvas-engine';
import { BoardFileError, parseBoardFile, parseImageFile, type ParsedBoardFile } from './board-file';
import { pickBoardFile } from './pick-file';

interface PendingReplace {
  fileName: string;
  parsed: ParsedBoardFile;
  /** Only set for our own format — see the assignment in `apply`. */
  handle: FileSystemFileHandle | null;
}

interface UseOpenBoardFileOptions {
  doc: BoardDocument;
  /** How many shapes the board holds now — an empty board skips the confirm. */
  shapeCount: number;
  genId: () => string;
  /** Called once the board has been replaced, for camera and background. */
  onLoaded: (shapes: readonly Shape[], canvasBackground?: string) => void;
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
  const loaded = `Loaded ${shapes.length} shape${shapes.length === 1 ? '' : 's'} from ${fileName}.`;
  if (skipped === 0) return loaded;
  // Images and frames are the usual cause — the adapter has no equivalent for
  // them — so the count is reported rather than silently swallowed.
  return `${loaded} ${skipped} item${skipped === 1 ? '' : 's'} couldn't be opened and ${
    skipped === 1 ? 'was' : 'were'
  } skipped.`;
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
  fileHandleRef,
  onNotice,
}: UseOpenBoardFileOptions): OpenBoardFile {
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(null);

  const apply = useCallback(
    (parsed: ParsedBoardFile, fileName: string, handle: FileSystemFileHandle | null) => {
      doc.replaceShapes(parsed.shapes);
      doc.breakUndoGroup();

      fileHandleRef.current = handle;
      onLoaded(parsed.shapes, parsed.canvasBackground);
      if (parsed.skipped > 0) {
        onNotice(describeLoad(parsed, fileName));
      }
    },
    [doc, fileHandleRef, onLoaded, onNotice],
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
        const parsed = isImage ? parseImageFile(file, genId) : parseBoardFile(file.text, genId);
        if (parsed.shapes.length === 0) {
          onNotice(`There were no shapes CanvasFlow could open in ${file.name}.`);
          return;
        }

        const handle = parsed.format === 'canvasflow' ? (file.handle ?? null) : null;

        if (shapeCount === 0) {
          apply(parsed, file.name, handle);
        } else {
          setPendingReplace({ fileName: file.name, parsed, handle });
        }
      } catch (error) {
        onNotice(
          error instanceof BoardFileError
            ? error.message
            : "That file couldn't be opened. It may be unreadable or corrupt.",
        );
      }
    })();
  }, [apply, genId, onNotice, shapeCount]);

  const confirmReplace = useCallback(() => {
    if (!pendingReplace) return;
    apply(pendingReplace.parsed, pendingReplace.fileName, pendingReplace.handle);
    setPendingReplace(null);
  }, [apply, pendingReplace]);

  const cancelReplace = useCallback(() => setPendingReplace(null), []);

  return { openBoardFile, pendingReplace, confirmReplace, cancelReplace };
}
