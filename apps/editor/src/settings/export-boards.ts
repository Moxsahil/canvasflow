import { BoardDocument, isImage, type Shape } from '@canvasflow/canvas-engine';
import { strToU8, zipSync } from 'fflate';
import { env } from '@/lib/env';
import { BOARD_FILE_EXTENSION, serializeBoardFile } from '../file/board-file';
import { toFileName } from '../file/save-file';
import { downloadImage } from '../images/image-client';
import { fetchLibraryItems } from '../library/library-client';
import { writeLibraryFile } from '../library/library-files';

/**
 * Export all boards: every board you own, in every workspace, as one .zip.
 *
 * Each board is its own `.canvasflow` file with its pictures inside it, so any
 * one of them opens whole on any board, and the library comes along as a
 * `.canvasflowlib`. The gateway hands over each board's saved document and
 * nothing more; reading it, fetching the images and packing the archive all
 * happen here, so no archive is ever built or held on a server.
 */

export interface ExportableBoard {
  id: string;
  title: string;
  updatedAt: string;
}

export interface BoardsExport {
  blob: Blob;
  fileName: string;
  /** Boards written into the archive. */
  boards: number;
  /** Titles of the boards that could not be read, and were left out. */
  failedBoards: string[];
  /** Images whose bytes could not be fetched, so open as skipped. */
  missingImages: number;
  libraryItems: number;
  /** The library could not be read, so is not in the archive. */
  libraryFailed: boolean;
}

/** The board open in this editor, read live rather than from its last save. */
export interface OpenBoard {
  id: string;
  shapes: () => readonly Shape[];
}

/** How many images are fetched at once. */
const IMAGE_CONCURRENCY = 4;

function request(path: string, token: string) {
  return fetch(`${env.VITE_API_URL}/users/me/export${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function fetchBoards(token: string): Promise<ExportableBoard[]> {
  const res = await request('/boards', token);
  if (res.status === 401) throw new Error('Your session has ended. Sign in again.');
  if (!res.ok) throw new Error(`Your boards could not be listed (${res.status}).`);
  return ((await res.json()) as { data: ExportableBoard[] }).data;
}

/** A board's shapes, read from its saved document by the engine's own code. */
async function fetchBoardShapes(token: string, boardId: string): Promise<Shape[]> {
  const res = await request(`/boards/${boardId}`, token);
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`Board ${boardId} could not be read (${res.status}).`);
  const doc = new BoardDocument();
  try {
    doc.applyUpdate(new Uint8Array(await res.arrayBuffer()));
    return doc.getShapes();
  } finally {
    doc.destroy();
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not encode image'));
    reader.readAsDataURL(blob);
  });
}

/** The board's images as data URLs, by file id. Any that cannot be fetched are absent. */
async function fetchImages(
  token: string,
  boardId: string,
  shapes: readonly Shape[],
): Promise<Map<string, string>> {
  const pending = [...new Set(shapes.filter(isImage).map((shape) => shape.fileId))];
  const images = new Map<string, string>();
  const worker = async () => {
    for (let fileId = pending.pop(); fileId !== undefined; fileId = pending.pop()) {
      try {
        const blob = await downloadImage(boardId, token, fileId);
        if (blob) images.set(fileId, await blobToDataUrl(blob));
      } catch {
        // Missing from the file, and counted, rather than failing the export.
      }
    }
  };
  await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, worker));
  return images;
}

/**
 * A file name for each title, unique within the archive. Two boards called
 * "Untitled board" become "Untitled board.canvasflow" and
 * "Untitled board (2).canvasflow", in the order given.
 */
export function uniqueFileNames(titles: readonly string[], extension: string): string[] {
  const taken = new Set<string>();
  return titles.map((title) => {
    const base = toFileName(title, '');
    for (let n = 1; ; n += 1) {
      const name = `${n === 1 ? base : `${base} (${n})`}${extension}`;
      if (!taken.has(name.toLowerCase())) {
        taken.add(name.toLowerCase());
        return name;
      }
    }
  });
}

/** "canvasflow-export-2026-10-14.zip", by the date where the person is. */
export function exportFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `canvasflow-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
}

/**
 * Every board you own and your library, packed. Null when there is nothing
 * to export. `onProgress` hears each board as it is finished.
 */
export async function exportAllBoards({
  token,
  openBoard,
  onProgress,
}: {
  token: string;
  openBoard?: OpenBoard | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<BoardsExport | null> {
  const boards = await fetchBoards(token);
  const names = uniqueFileNames(
    boards.map((board) => board.title),
    BOARD_FILE_EXTENSION,
  );

  const entries: Record<string, Uint8Array> = {};
  const failedBoards: string[] = [];
  let missingImages = 0;

  onProgress?.(0, boards.length);
  for (const [index, board] of boards.entries()) {
    try {
      // The board on screen may be up to the sync-server's save delay ahead
      // of what is stored, so it is read from the editor instead.
      const shapes =
        openBoard?.id === board.id
          ? [...openBoard.shapes()]
          : await fetchBoardShapes(token, board.id);
      const images = await fetchImages(token, board.id, shapes);
      missingImages +=
        new Set(shapes.filter(isImage).map((shape) => shape.fileId)).size - images.size;
      entries[names[index]!] = strToU8(serializeBoardFile(shapes, images));
    } catch {
      failedBoards.push(board.title);
    }
    onProgress?.(index + 1, boards.length);
  }

  let libraryItems = 0;
  let libraryFailed = false;
  try {
    const items = await fetchLibraryItems(token);
    libraryItems = items.length;
    if (items.length > 0) {
      entries['library.canvasflowlib'] = strToU8(
        writeLibraryFile(
          items.map((item) => ({ name: item.name, shapes: item.shapes as unknown as Shape[] })),
        ),
      );
    }
  } catch {
    libraryFailed = true;
  }

  if (Object.keys(entries).length === 0 && failedBoards.length === 0) return null;
  if (Object.keys(entries).length === 0) {
    throw new Error('None of your boards could be read. Try again in a moment.');
  }

  const zipped = zipSync(entries, { level: 6 });
  return {
    blob: new Blob([zipped.slice().buffer as ArrayBuffer], { type: 'application/zip' }),
    fileName: exportFileName(),
    boards: boards.length - failedBoards.length,
    failedBoards,
    missingImages,
    libraryItems,
    libraryFailed,
  };
}

/** What the Export row says once the download has started. */
export function exportSummary(result: BoardsExport): string {
  const boards = `${result.boards} ${result.boards === 1 ? 'board' : 'boards'}`;
  const parts = [
    result.libraryItems > 0 ? `Downloaded ${boards} and your library` : `Downloaded ${boards}`,
  ];
  if (result.failedBoards.length > 0) {
    const n = result.failedBoards.length;
    parts.push(`${n} ${n === 1 ? 'board' : 'boards'} couldn’t be read`);
  }
  if (result.missingImages > 0) {
    const n = result.missingImages;
    parts.push(`${n} ${n === 1 ? 'image' : 'images'} couldn’t be fetched`);
  }
  if (result.libraryFailed) parts.push('your library couldn’t be read');
  return parts.join(' · ');
}
