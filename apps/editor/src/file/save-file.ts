import { BOARD_FILE_EXTENSION } from './board-file';

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

// Not in this TypeScript version's DOM lib, and only in Chromium browsers.
declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

/** Everything the app can write to disk, and how each is described. */
export const SAVE_FORMATS = {
  board: {
    extension: BOARD_FILE_EXTENSION,
    mimeType: 'application/json',
    description: 'CanvasFlow board',
  },
  png: { extension: '.png', mimeType: 'image/png', description: 'PNG image' },
  svg: { extension: '.svg', mimeType: 'image/svg+xml', description: 'SVG image' },
} as const;

export type SaveFormat = keyof typeof SAVE_FORMATS;

export type SaveResult =
  /** Written. `handle` is null when it went out as a plain download. */
  | { status: 'saved'; handle: FileSystemFileHandle | null; name: string }
  /** The user dismissed the picker. Not an error, and not worth reporting. */
  | { status: 'cancelled' };

/** Keeps a board name usable as a filename without surprising the user. */
function toFileName(boardName: string, extension: string): string {
  const cleaned = boardName.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'board';
  return `${cleaned}${extension}`;
}

async function writeTo(handle: FileSystemFileHandle, data: string | Blob): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

/** Last resort where the File System Access API isn't available. */
function downloadFile(name: string, data: string | Blob, mimeType: string): void {
  const blob = typeof data === 'string' ? new Blob([data], { type: mimeType }) : data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on a later tick so the click has definitely started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveFile({
  boardName,
  data,
  format,
  handle,
}: {
  boardName: string;
  data: string | Blob;
  format: SaveFormat;
  handle?: FileSystemFileHandle | null;
}): Promise<SaveResult> {
  const { extension, mimeType, description } = SAVE_FORMATS[format];
  const name = toFileName(boardName, extension);

  if (handle) {
    try {
      await writeTo(handle, data);
      return { status: 'saved', handle, name: handle.name };
    } catch (error) {
      // A handle carried over from opening a file only grants read access
      // until the user approves writing, and they can decline. Falling back to
      // the picker turns that into "choose where to save" rather than a dead
      // end. Anything else — a deleted file, a revoked mount — lands here too,
      // and the picker is the right answer for those as well.
      if (!(error instanceof DOMException)) throw error;
    }
  }

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const picked = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description, accept: { [mimeType]: [extension] } }],
      });
      await writeTo(picked, data);
      return { status: 'saved', handle: picked, name: picked.name };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      throw error;
    }
  }

  downloadFile(name, data, mimeType);
  return { status: 'saved', handle: null, name };
}

/** The board document itself. Handles from this are reused by later saves. */
export function saveBoardFile({
  boardName,
  text,
  handle,
}: {
  boardName: string;
  text: string;
  handle?: FileSystemFileHandle | null;
}): Promise<SaveResult> {
  return saveFile({ boardName, data: text, format: 'board', handle });
}
