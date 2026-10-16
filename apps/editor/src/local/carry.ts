import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { BoardDocument, isImage, type Shape } from '@canvasflow/canvas-engine';
import type { CarriedImage } from '../file/embedded-images';
import { offlineCacheKey } from '../sync/useOfflineCache';
import { LOCAL_BOARD_ID, LOCAL_USER, goTo, localBoardLinks } from './local-board';
import { readLocalImage } from './local-images';

/**
 * Bringing the local board into an account.
 *
 * Someone draws on the board at the editor's own address, then signs in or
 * creates an account — usually because they wanted to share it. Signing in
 * lands on an account's board, a different page, so without this the drawing
 * looks lost: it is still in this browser, just not anywhere they are.
 *
 * So leaving the local board for an account leaves a note here, and the
 * account's editor, finding it, copies the local board's shapes and pictures
 * into the account. The note says where to: nowhere yet, or the board made for
 * the drawing, which the editor opens before copying into it.
 *
 * The local copy is left as it is, so nothing can be lost on the way. What was
 * carried is remembered by its Yjs state vector: the same drawing, unchanged,
 * is not carried twice by signing in again.
 */

const NOTE_KEY = 'canvasflow:carry-local-board';
const CARRIED_KEY = 'canvasflow:local-board-carried';

/** A note older than this is from a sign-in that never finished, and is dropped. */
const NOTE_LIFETIME_MS = 60 * 60 * 1000;

export interface CarryNote {
  /** When the local board was left, in ms since the epoch. */
  at: number;
  /** The account board made to hold the drawing, once there is one. */
  target: string | null;
  /** The local board was left in order to share it: open the share window after. */
  share: boolean;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage refused: the drawing simply stays on the local board.
  }
}

/** Leave the note, on the way from the local board to an account. */
export function noteCarry({ share = false }: { share?: boolean } = {}): void {
  const note: CarryNote = { at: Date.now(), target: null, share };
  write(NOTE_KEY, JSON.stringify(note));
}

/**
 * Leave the local board for the web app's account pages.
 *
 * Signing in and signing up bring the drawing along. Going to one's boards
 * plainly does not: that is going somewhere else, not taking this with you —
 * "Move to my account" is the way to do both, and passes `carry`.
 */
export function leaveForAccount(
  to: 'signIn' | 'signUp' | 'yourBoards',
  { share = false, carry = to !== 'yourBoards' }: { share?: boolean; carry?: boolean } = {},
): void {
  if (carry) noteCarry({ share });
  goTo(localBoardLinks[to]());
}

/** The note, if there is a current one. A stale or unreadable one is dropped. */
export function readCarry(now = Date.now()): CarryNote | null {
  const raw = read(NOTE_KEY);
  if (!raw) return null;
  try {
    const note = JSON.parse(raw) as Partial<CarryNote>;
    if (
      typeof note.at === 'number' &&
      now - note.at >= 0 &&
      now - note.at < NOTE_LIFETIME_MS &&
      (note.target === null || typeof note.target === 'string')
    ) {
      return { at: note.at, target: note.target, share: note.share === true };
    }
  } catch {
    // Fall through: not a note this build wrote.
  }
  write(NOTE_KEY, null);
  return null;
}

/** Point the note at the board made to hold the drawing. */
export function aimCarry(note: CarryNote, target: string): void {
  write(NOTE_KEY, JSON.stringify({ ...note, target }));
}

export function clearCarry(): void {
  write(NOTE_KEY, null);
}

/** What the local board holds, ready to be put on another board. */
export interface LocalDrawing {
  shapes: Shape[];
  images: Map<string, CarriedImage>;
  /** Which state of the local board this is; see `markCarried`. */
  version: string;
}

function encodeVersion(doc: Y.Doc): string {
  let binary = '';
  for (const byte of Y.encodeStateVector(doc)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The local board as this browser has it, or null when there is nothing to
 * carry: it is empty, or it is exactly what was carried last time.
 *
 * Read from IndexedDB into a document of its own, since the local board's
 * editor is not the one open. Pictures missing from storage are left out; the
 * shape still comes across and shows where the picture was.
 */
export async function readLocalDrawing(): Promise<LocalDrawing | null> {
  const board = new BoardDocument();
  const yDoc = board.yDoc;
  const provider = new IndexeddbPersistence(offlineCacheKey(LOCAL_USER.id, LOCAL_BOARD_ID), yDoc);
  try {
    await provider.whenSynced;
    const version = encodeVersion(yDoc);
    if (version === read(CARRIED_KEY)) return null;

    const shapes = board.getShapes();
    if (shapes.length === 0) return null;

    const images = new Map<string, CarriedImage>();
    for (const shape of shapes) {
      if (!isImage(shape) || images.has(shape.fileId)) continue;
      const blob = await readLocalImage(shape.fileId).catch(() => null);
      if (blob) {
        images.set(shape.fileId, {
          mimeType: blob.type || shape.mimeType,
          bytes: new Uint8Array(await blob.arrayBuffer()),
        });
      }
    }
    return { shapes, images, version };
  } finally {
    // destroy() lets go of the database and leaves what is stored in it.
    await provider.destroy();
    board.destroy();
  }
}

/** This state of the local board is in an account now. */
export function markCarried(version: string): void {
  write(CARRIED_KEY, version);
}
