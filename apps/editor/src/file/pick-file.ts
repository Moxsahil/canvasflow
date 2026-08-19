import { BoardFileError, BOARD_FILE_EXTENSION } from './board-file';

/** Files this big aren't boards, and reading one would hang the tab. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = [
  BOARD_FILE_EXTENSION,
  '.excalidraw',
  '.json',
  // Images we exported with the scene embedded re-open as boards.
  '.png',
  '.svg',
];

export interface PickedFile {
  name: string;
  /** Text for JSON and SVG; for a PNG this is empty and `bytes` carries it. */
  text: string;
  /** Set only for binary formats — a PNG with an embedded scene. */
  bytes?: Uint8Array;
  /**
   * Present only where the File System Access API is available. Holding it is
   * what will let "Save" write back over the same file instead of dropping a
   * second copy in Downloads.
   */
  handle?: FileSystemFileHandle;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

// Not in this TypeScript version's DOM lib, and only in Chromium browsers.
declare global {
  interface Window {
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
  }
}

function isPng(file: File): boolean {
  return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
}

async function readFile(file: File): Promise<{ text: string; bytes?: Uint8Array }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new BoardFileError('That file is over 10 MB — too large to be a board.');
  }
  // Reading a PNG as text would mangle it; its scene lives in a chunk.
  if (isPng(file)) {
    return { text: '', bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  return { text: await file.text() };
}

/**
 * Asks for a board file, resolving to `null` when the picker is dismissed.
 *
 * Prefers the File System Access API and falls back to a detached file input,
 * so this works everywhere while still yielding a file handle on browsers that
 * support one. Must be called from a user gesture — both routes require it.
 */
export async function pickBoardFile(): Promise<PickedFile | null> {
  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'CanvasFlow board, Excalidraw drawing, or exported image',
            accept: { 'application/json': ACCEPTED_EXTENSIONS },
          },
        ],
      });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: file.name, ...(await readFile(file)), handle };
    } catch (error) {
      // Dismissing the picker rejects with AbortError; that isn't a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }
  }

  return new Promise<PickedFile | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [...ACCEPTED_EXTENSIONS, 'application/json'].join(',');
    input.style.display = 'none';

    const cleanup = () => input.remove();

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      readFile(file).then(
        (contents) => resolve({ name: file.name, ...contents }),
        (error: unknown) => reject(error),
      );
    });
    // Fires when the dialog is dismissed. Not universal, but where it's
    // missing the promise simply stays pending, which is what a dismissed
    // picker looked like before the event existed.
    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });

    document.body.append(input);
    input.click();
  });
}
