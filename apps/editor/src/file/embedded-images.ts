import { MAX_STORED_IMAGE_BYTES, isImage, type Shape } from '@canvasflow/canvas-engine';
import { sha256Hex } from '../images/prepare-image';
import type { ParsedBoardFile } from './board-file';

/** An image a board file brought with it, ready to upload to this board. */
export interface CarriedImage {
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * The images inside an opened board file, as bytes — and the file's shapes
 * pointed at them.
 *
 * A file's ids are a claim, not a fact. Each image is hashed again here and
 * filed under what its bytes really hash to, which is what this board's
 * storage keys on, so a hand-edited file cannot put one picture's bytes behind
 * another's id. An image whose bytes cannot be read, or are larger than a
 * board stores, is dropped with the shapes that show it, and counted.
 */
export async function unpackImages(
  parsed: ParsedBoardFile,
): Promise<{ parsed: ParsedBoardFile; images: Map<string, CarriedImage> }> {
  const images = new Map<string, CarriedImage>();
  const realIds = new Map<string, string>();

  for (const [claimedId, file] of parsed.files) {
    try {
      const bytes = new Uint8Array(await (await fetch(file.dataURL)).arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_STORED_IMAGE_BYTES) continue;
      const fileId = await sha256Hex(bytes);
      realIds.set(claimedId, fileId);
      images.set(fileId, { mimeType: file.mimeType, bytes });
    } catch {
      // Unreadable: its shapes are dropped below and counted as skipped.
    }
  }

  let dropped = 0;
  const shapes: Shape[] = [];
  for (const shape of parsed.shapes) {
    if (!isImage(shape)) {
      shapes.push(shape);
      continue;
    }
    const fileId = realIds.get(shape.fileId);
    if (fileId === undefined) {
      dropped += 1;
      continue;
    }
    shapes.push({ ...shape, fileId, mimeType: images.get(fileId)!.mimeType });
  }

  return {
    parsed: { ...parsed, shapes, skipped: parsed.skipped + dropped, files: new Map() },
    images,
  };
}
