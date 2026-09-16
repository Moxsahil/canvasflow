import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { IDENTITY_CAMERA, type Camera } from '../machine/tool-machine.types';
import { readCamera, storeCamera } from './camera-storage';

/**
 * How long the camera has to sit still before it is written down.
 *
 * A pan moves the camera on every frame of the gesture, and a write per frame
 * is a write nobody reads. `pagehide` below covers the reload that beats the
 * timer, which is the one case where losing the last move would be noticed.
 */
export const CAMERA_SAVE_DELAY_MS = 250;

const sameCamera = (a: Camera, b: Camera) => a.x === b.x && a.y === b.y && a.zoom === b.zoom;

/**
 * Open the board looking where it was left, and keep that up to date.
 *
 * Without this, every reload returns to the world origin. On a board whose
 * work sits near the origin that reads as the whole canvas jumping into the
 * top-left corner; on one whose work sits anywhere else it reads as the
 * drawing having gone missing.
 *
 * Answers whether a stored view was found, so that the fit-to-content a board
 * gets on its first open doesn't overrule a view someone chose.
 */
export function useCameraPersistence(
  boardId: string,
  camera: Camera,
  restore: (camera: Camera) => void,
): RefObject<boolean> {
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  /**
   * The view this board was opened at, and afterwards the last view written.
   *
   * Held so that the save below can tell a camera that has been moved from one
   * that has only ever been the machine's starting value — which is what a
   * restored board looks like for the moment between reading the stored view
   * and rendering it.
   */
  const savedRef = useRef<Camera | null>(null);

  /** Whether this board was opened at a view someone had left it at. */
  const restoredRef = useRef(false);

  // A layout effect, so the restored view is in hand before the first paint.
  // Restoring after it would show the origin for a frame and then jump, which
  // is the behaviour this exists to remove.
  useLayoutEffect(() => {
    const stored = readCamera(boardId);
    savedRef.current = stored;
    restoredRef.current = stored !== null;
    if (stored) restoreRef.current(stored);
  }, [boardId]);

  useEffect(() => {
    // Nothing worth writing until the camera differs from the view the board
    // was opened at. Without this the starting value would be written over the
    // stored one on mount, and the board would restore to the origin for ever
    // after — the effects here run twice on mount in development, so the write
    // would land before the second read.
    const opened = savedRef.current ?? IDENTITY_CAMERA;
    if (sameCamera(opened, camera)) return;

    const id = window.setTimeout(() => {
      storeCamera(boardId, camera);
      savedRef.current = camera;
    }, CAMERA_SAVE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [boardId, camera]);

  // The tab going away is the one moment the debounce cannot cover, and
  // reloading straight after a pan is when that matters most. Deliberately not
  // also flushed on unmount: a remount would then write the starting camera
  // over the stored view before the restore above had read it.
  useEffect(() => {
    const flush = () => {
      storeCamera(boardId, cameraRef.current);
      savedRef.current = cameraRef.current;
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [boardId]);

  return restoredRef;
}
