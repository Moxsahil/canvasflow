import { isImage, isSupportedImageMimeType, type Shape } from '@canvasflow/canvas-engine';
import { excalidrawElementsToShapes } from '../clipboard/excalidraw-adapter';
import { t } from '../i18n';
import { sanitizeShapes } from './shape-sanitizer';
import { extractSceneFromPng, extractSceneFromSvg } from './scene-metadata';

export const BOARD_FILE_TYPE = 'canvasflow/board';
/**
 * 2 added `files`: the images on the board, carried inside the file so it
 * opens whole on any board. Version 1 files read the same, without pictures.
 */
export const BOARD_FILE_VERSION = 2;
export const BOARD_FILE_EXTENSION = '.canvasflow';

/**
 * The on-disk board format. Deliberately separate from the clipboard payload
 * in src/clipboard/schema.ts — a file is a whole board where the clipboard is a
 * fragment, and the two will version independently. "Save to…" writes this.
 */
export interface BoardFile {
  type: typeof BOARD_FILE_TYPE;
  version: number;
  source?: string;
  shapes: unknown[];
  /** The bytes behind the board's image shapes, by file id. */
  files?: Record<string, EmbeddedFile>;
}

/** One image's bytes, as a `data:` URL so the file stays plain JSON. */
export interface EmbeddedFile {
  mimeType: string;
  dataURL: string;
}

export interface ParsedBoardFile {
  shapes: Shape[];
  skipped: number;
  format: 'canvasflow' | 'excalidraw';
  /**
   * The images the file brought, by the file id its shapes name. Checked for
   * form only: the bytes are decoded and hashed before anything uploads them.
   */
  files: ReadonlyMap<string, EmbeddedFile>;
}

const FILE_ID = /^[0-9a-f]{64}$/;

/** The `files` a board file carries, keeping only entries that could be an image. */
function readEmbeddedFiles(value: unknown): Map<string, EmbeddedFile> {
  const files = new Map<string, EmbeddedFile>();
  if (!isRecord(value)) return files;
  for (const [fileId, entry] of Object.entries(value)) {
    if (!FILE_ID.test(fileId) || !isRecord(entry)) continue;
    const { mimeType, dataURL } = entry;
    if (typeof mimeType !== 'string' || !isSupportedImageMimeType(mimeType)) continue;
    if (typeof dataURL !== 'string' || !dataURL.startsWith(`data:${mimeType};base64,`)) continue;
    files.set(fileId, { mimeType, dataURL });
  }
  return files;
}

export class BoardFileError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fromExcalidrawElements(elements: unknown[], genId: () => string): Shape[] {
  const shapes: Shape[] = [];
  for (const element of elements) {
    if (!isRecord(element)) continue;
    try {
      const [shape] = excalidrawElementsToShapes([element as never], genId);
      if (shape) shapes.push(shape);
    } catch {
      // An element we can't convert isn't fatal; skip it and keep importing.
    }
  }
  return shapes;
}

export function parseBoardFile(text: string, genId: () => string): ParsedBoardFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BoardFileError(t('file.notJson'));
  }

  if (!isRecord(data)) {
    throw new BoardFileError(t('file.notBoard'));
  }

  switch (data.type) {
    case BOARD_FILE_TYPE:
    case 'canvasflow/clipboard': {
      const version = typeof data.version === 'number' ? data.version : 1;
      if (version > BOARD_FILE_VERSION) {
        throw new BoardFileError(t('file.newerVersion', { version }));
      }
      if (!Array.isArray(data.shapes)) {
        throw new BoardFileError(t('file.noShapes'));
      }
      const files = readEmbeddedFiles(data.files);
      const { shapes, skipped } = sanitizeShapes(data.shapes, genId, {
        imageFileIds: new Set(files.keys()),
      });
      // A `canvasBackground` written by an older build is ignored rather than
      // rejected: the canvas ground follows the app theme now, so the field
      // has nothing left to set.
      return { shapes, skipped, format: 'canvasflow', files };
    }

    case 'excalidraw':
    case 'excalidraw/clipboard': {
      if (!Array.isArray(data.elements)) {
        throw new BoardFileError(t('file.noElements'));
      }
      const converted = fromExcalidrawElements(data.elements, genId);
      const { shapes } = sanitizeShapes(converted, genId);
      return {
        shapes,
        skipped: data.elements.length - shapes.length,
        format: 'excalidraw',
        files: new Map(),
      };
    }

    default:
      throw new BoardFileError(t('file.unknownFormat'));
  }
}

export function parseImageFile(
  file: { text: string; bytes?: Uint8Array },
  genId: () => string,
): ParsedBoardFile {
  const embedded = file.bytes ? extractSceneFromPng(file.bytes) : extractSceneFromSvg(file.text);

  if (!embedded) {
    throw new BoardFileError(t('file.noScene'));
  }
  return parseBoardFile(embedded, genId);
}

/**
 * The board as a file. `images` holds `data:` URLs by file id; any the board's
 * image shapes name go inside the file, and the rest are left out. An image
 * with no bytes to hand is written without them, and opens as skipped.
 */
export function serializeBoardFile(
  shapes: readonly Shape[],
  images: ReadonlyMap<string, string> = new Map(),
): string {
  const files: Record<string, EmbeddedFile> = {};
  for (const shape of shapes) {
    if (!isImage(shape) || shape.fileId in files) continue;
    const dataURL = images.get(shape.fileId);
    if (dataURL) files[shape.fileId] = { mimeType: shape.mimeType, dataURL };
  }
  const file: BoardFile = {
    type: BOARD_FILE_TYPE,
    version: BOARD_FILE_VERSION,
    source: 'canvasflow',
    shapes: shapes as unknown[],
    ...(Object.keys(files).length > 0 && { files }),
  };
  return JSON.stringify(file);
}
