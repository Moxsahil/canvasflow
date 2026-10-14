import { useCallback, type MutableRefObject } from 'react';
import type { Shape } from '@canvasflow/canvas-engine';
import { serializeBoardFile } from './board-file';
import { saveBoardFile } from './save-file';
import { track } from '../analytics/analytics';

interface UseSaveBoardFileOptions {
  shapes: readonly Shape[];
  boardName: string;
  /**
   * The file this board is currently associated with, shared with the open
   * flow so that opening a board and then saving it writes back to the same
   * file instead of asking again.
   */
  fileHandleRef: MutableRefObject<FileSystemFileHandle | null>;
  /** The board's images as data URIs, so the file carries its pictures. */
  resolveDataUrls: (shapes: readonly Shape[]) => Promise<ReadonlyMap<string, string>>;
  onNotice: (message: string) => void;
}

export function useSaveBoardFile({
  shapes,
  boardName,
  fileHandleRef,
  resolveDataUrls,
  onNotice,
}: UseSaveBoardFileOptions): { saveBoardFileToDisk: () => void } {
  const saveBoardFileToDisk = useCallback(() => {
    void (async () => {
      try {
        const result = await saveBoardFile({
          boardName,
          text: async () => serializeBoardFile(shapes, await resolveDataUrls(shapes)),
          handle: fileHandleRef.current,
        });
        if (result.status === 'saved') {
          track('board_saved_to_file');
          fileHandleRef.current = result.handle;
        }
      } catch (error) {
        onNotice(
          error instanceof Error && error.message
            ? `The board couldn't be saved: ${error.message}`
            : "The board couldn't be saved.",
        );
      }
    })();
  }, [boardName, fileHandleRef, onNotice, resolveDataUrls, shapes]);

  return { saveBoardFileToDisk };
}
