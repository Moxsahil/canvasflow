import { SUPPORTED_IMAGE_ACCEPT, SUPPORTED_IMAGE_MIME_TYPES } from '@canvasflow/canvas-engine';

/**
 * Ask for one or more image files, resolving to an empty array if dismissed.
 *
 * Mirrors `pickBoardFile`: the File System Access API where it exists, a
 * detached input everywhere else. Unlike a board file there is no handle worth
 * keeping — an image is copied into the board, never written back to.
 *
 * Must be called from a user gesture; both routes require one.
 */
export async function pickImageFiles(): Promise<File[]> {
  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'Image',
            accept: Object.fromEntries(SUPPORTED_IMAGE_MIME_TYPES.map((type) => [type, []])),
          },
        ],
      });
      return await Promise.all(handles.map((handle) => handle.getFile()));
    } catch (error) {
      // Dismissing the picker rejects with AbortError; that isn't a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return [];
      throw error;
    }
  }

  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SUPPORTED_IMAGE_ACCEPT;
    input.multiple = true;
    input.style.display = 'none';

    const cleanup = () => input.remove();

    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      cleanup();
      resolve(files);
    });
    // Fires when the dialog is dismissed. Not universal, but where it's missing
    // the promise simply stays pending, which is what a dismissed picker looked
    // like before the event existed.
    input.addEventListener('cancel', () => {
      cleanup();
      resolve([]);
    });

    document.body.append(input);
    input.click();
  });
}

/** Every supported image among a DataTransfer's files — for drop and paste. */
export function imageFilesFromDataTransfer(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  return Array.from(transfer.files).filter((file) =>
    (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type),
  );
}
