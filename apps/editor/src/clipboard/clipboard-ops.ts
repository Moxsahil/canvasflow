import { SUPPORTED_IMAGE_MIME_TYPES, type Shape } from '@canvasflow/canvas-engine';
import { isCanvasFlowClipboard, isExcalidrawClipboard, type CanvasFlowClipboard } from './schema';
import { excalidrawElementsToShapes } from './excalidraw-adapter';

/**
 * Image files on the clipboard, as a paste would deliver them.
 *
 * Read before the text path, because a screenshot copied from another app puts
 * an image on the clipboard and nothing our text reader would recognise —
 * checking text first would simply find nothing and drop the paste.
 *
 * Returns empty rather than throwing where `clipboard.read` is unavailable or
 * refused: the text path is still worth trying, and a browser that will not
 * hand over the clipboard is not an error the user can fix.
 */
export async function readImagesFromClipboard(): Promise<File[]> {
  if (typeof navigator.clipboard?.read !== 'function') return [];

  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    return [];
  }

  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((candidate) =>
      (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(candidate),
    );
    if (!type) continue;
    try {
      const blob = await item.getType(type);
      const extension = type.split('/')[1]?.replace('+xml', '') ?? 'png';
      files.push(new File([blob], `pasted-image.${extension}`, { type }));
    } catch {
      // One unreadable item shouldn't discard the rest of the paste.
    }
  }
  return files;
}

/**
 * Serialize shapes into our clipboard JSON format and write to system clipboard.
 *
 * Falls back to console.error if the browser blocks clipboard access.
 * Returns true on success, false on failure (silent — no modal).
 */
export async function writeShapesToClipboard(shapes: readonly Shape[]): Promise<boolean> {
  if (shapes.length === 0) return false;

  const payload: CanvasFlowClipboard = {
    type: 'canvasflow/clipboard',
    version: 1,
    shapes: [...shapes],
  };

  try {
    await navigator.clipboard.writeText(JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error('Clipboard write failed:', err);
    return false;
  }
}

export async function readShapesFromClipboard(genId: () => string): Promise<Shape[]> {
  let raw: string;
  try {
    raw = await navigator.clipboard.readText();
  } catch (err) {
    console.error('Clipboard read failed:', err);
    return [];
  }

  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON — not our data
    return [];
  }

  if (isCanvasFlowClipboard(parsed)) {
    // Reassign IDs so pasted shapes never collide with existing ones
    return parsed.shapes.map((s) => ({ ...s, id: genId() }));
  }

  if (isExcalidrawClipboard(parsed)) {
    return excalidrawElementsToShapes(parsed.elements, genId);
  }

  return [];
}
