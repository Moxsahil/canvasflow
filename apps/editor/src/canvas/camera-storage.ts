import { MAX_ZOOM, MIN_ZOOM, type Camera } from '../machine/tool-machine.types';

export const CAMERA_STORAGE_PREFIX = 'cf:camera:';

/**
 * Per board, and per device.
 *
 * Where you are looking is not part of the board — two people on one board
 * look at different corners of it, and a view pushed into the document would
 * drag everyone else's screen along with it. So this is local to whoever is
 * looking, and keyed by board so that moving between boards doesn't carry the
 * last one's position across.
 */
export const cameraStorageKey = (boardId: string) => `${CAMERA_STORAGE_PREFIX}${boardId}`;

const isFinitePosition = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The view this board was last left at, or null to open at the origin. */
export function readCamera(boardId: string): Camera | null {
  try {
    const stored = localStorage.getItem(cameraStorageKey(boardId));
    if (!stored) return null;

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { x, y, zoom } = parsed as Record<string, unknown>;
    if (!isFinitePosition(x) || !isFinitePosition(y) || !isFinitePosition(zoom)) return null;

    // Clamped rather than rejected: a view saved by a build with different
    // bounds is still the corner of the board you were working in, and is
    // worth returning to at the nearest zoom this build allows.
    return { x, y, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) };
  } catch {
    // Unreadable storage just means the board opens where a new one would.
    return null;
  }
}

export function storeCamera(boardId: string, camera: Camera): void {
  try {
    localStorage.setItem(
      cameraStorageKey(boardId),
      JSON.stringify({ x: camera.x, y: camera.y, zoom: camera.zoom }),
    );
  } catch {
    // The position just won't survive a reload.
  }
}
