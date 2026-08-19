import type { Shape } from '@canvasflow/canvas-engine';
import { excalidrawElementsToShapes } from '../clipboard/excalidraw-adapter';
import { sanitizeShapes } from './shape-sanitizer';
import { extractSceneFromPng, extractSceneFromSvg } from './scene-metadata';

export const BOARD_FILE_TYPE = 'canvasflow/board';
export const BOARD_FILE_VERSION = 1;
export const BOARD_FILE_EXTENSION = '.canvasflow';

/**
 * The on-disk board format. Deliberately separate from the clipboard payload
 * in src/clipboard/schema.ts — a file is a whole board (background included)
 * where the clipboard is a fragment, and the two will version independently.
 * "Save to…" writes this.
 */
export interface BoardFile {
  type: typeof BOARD_FILE_TYPE;
  version: number;
  source?: string;
  shapes: unknown[];
  canvasBackground?: string;
}

export interface ParsedBoardFile {
  shapes: Shape[];
  skipped: number;
  canvasBackground?: string;
  format: 'canvasflow' | 'excalidraw';
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
    throw new BoardFileError("That file isn't valid JSON, so it can't be a board.");
  }

  if (!isRecord(data)) {
    throw new BoardFileError("That file doesn't look like a board.");
  }

  switch (data.type) {
    case BOARD_FILE_TYPE:
    case 'canvasflow/clipboard': {
      const version = typeof data.version === 'number' ? data.version : 1;
      if (version > BOARD_FILE_VERSION) {
        throw new BoardFileError(
          `That board was saved by a newer version of CanvasFlow (file version ${version}).`,
        );
      }
      if (!Array.isArray(data.shapes)) {
        throw new BoardFileError('That board file has no shapes in it.');
      }
      const { shapes, skipped } = sanitizeShapes(data.shapes, genId);
      const background = data.canvasBackground;
      return {
        shapes,
        skipped,
        canvasBackground: typeof background === 'string' ? background : undefined,
        format: 'canvasflow',
      };
    }

    case 'excalidraw':
    case 'excalidraw/clipboard': {
      if (!Array.isArray(data.elements)) {
        throw new BoardFileError('That Excalidraw file has no elements in it.');
      }
      const converted = fromExcalidrawElements(data.elements, genId);
      const { shapes } = sanitizeShapes(converted, genId);
      const appState = isRecord(data.appState) ? data.appState : undefined;
      const background = appState?.viewBackgroundColor;
      return {
        shapes,
        skipped: data.elements.length - shapes.length,
        canvasBackground: typeof background === 'string' ? background : undefined,
        format: 'excalidraw',
      };
    }

    default:
      throw new BoardFileError("That file isn't a CanvasFlow board or an Excalidraw drawing.");
  }
}

export function parseImageFile(
  file: { text: string; bytes?: Uint8Array },
  genId: () => string,
): ParsedBoardFile {
  const embedded = file.bytes ? extractSceneFromPng(file.bytes) : extractSceneFromSvg(file.text);

  if (!embedded) {
    throw new BoardFileError(
      'That image has no board inside it. Only images exported with \u201cembed scene\u201d can be opened.',
    );
  }
  return parseBoardFile(embedded, genId);
}

export function serializeBoardFile(shapes: readonly Shape[], canvasBackground?: string): string {
  const file: BoardFile = {
    type: BOARD_FILE_TYPE,
    version: BOARD_FILE_VERSION,
    source: 'canvasflow',
    shapes: shapes as unknown[],
    ...(canvasBackground ? { canvasBackground } : {}),
  };
  return JSON.stringify(file);
}
