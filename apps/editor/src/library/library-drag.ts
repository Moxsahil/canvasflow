import type { LibraryEntry } from './useLibrary';

/**
 * The item being dragged out of the library, held here for the board to take
 * when it is let go.
 *
 * The drag itself carries only the item's id, under a type of its own. The
 * shapes stay in this tab: what arrives with a drop could have been dragged in
 * from anywhere, and only an item this panel handed out is placed.
 */
let dragged: LibraryEntry | null = null;

export function startLibraryDrag(entry: LibraryEntry): void {
  dragged = entry;
}

export function endLibraryDrag(): void {
  dragged = null;
}

/** The item being dragged, if it is the one this id names. */
export function draggedLibraryEntry(id: string): LibraryEntry | null {
  return dragged?.id === id ? dragged : null;
}
