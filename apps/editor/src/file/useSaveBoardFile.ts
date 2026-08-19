import { useCallback, type MutableRefObject } from 'react';
import type { Shape } from '@canvasflow/canvas-engine';
import { serializeBoardFile } from './board-file';
import { saveBoardFile } from './save-file';

interface UseSaveBoardFileOptions {
  shapes: readonly Shape[];
  canvasBackground: string;
  boardName: string;
  /**
   * The file this board is currently associated with, shared with the open
   * flow so that opening a board and then saving it writes back to the same
   * file instead of asking again.
   */
  fileHandleRef: MutableRefObject<FileSystemFileHandle | null>;
  onNotice: (message: string) => void;
}

export function useSaveBoardFile({
  shapes,
  canvasBackground,
  boardName,
  fileHandleRef,
  onNotice,
}: UseSaveBoardFileOptions): { saveBoardFileToDisk: () => void } {
  const saveBoardFileToDisk = useCallback(() => {
    void (async () => {
      try {
        const result = await saveBoardFile({
          boardName,
          text: serializeBoardFile(shapes, canvasBackground),
          handle: fileHandleRef.current,
        });
        if (result.status === 'saved') {
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
  }, [boardName, canvasBackground, fileHandleRef, onNotice, shapes]);

  return { saveBoardFileToDisk };
}
