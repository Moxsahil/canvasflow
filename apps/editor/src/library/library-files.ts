import type { Shape } from '@canvasflow/canvas-engine';
import { excalidrawElementsToShapes } from '../clipboard/excalidraw-adapter';
import type { ExcalidrawElement } from '../clipboard/schema';
import { LIBRARY_NAME_MAX, readLibraryShapes, wordedItemName } from './library-items';

/** What the Import picker offers: ours, Excalidraw's, and either saved as plain JSON. */
export const LIBRARY_FILE_ACCEPT = '.canvasflowlib,.excalidrawlib,.json,application/json';

/** The gateway's limits on one item, checked before sending so a file is not refused whole. */
const ITEM_MAX_SHAPES = 500;
const ITEM_MAX_BYTES = 200 * 1024;

export interface LibraryFileItem {
  readonly name: string;
  readonly shapes: Shape[];
}

export interface LibraryFile {
  readonly format: 'canvasflow' | 'excalidraw';
  readonly items: LibraryFileItem[];
  /** Items with nothing in them this editor can draw, left out whole. */
  readonly emptyItems: number;
  /** Images in the file, which cannot come along yet. */
  readonly imagesLeftOut: number;
}

/**
 * The items a library file holds, rebuilt as shapes — or null when the file
 * is not a library at all.
 *
 * Two formats are read: this editor's own, and Excalidraw's, in both of the
 * shapes its files have had. Every shape is rebuilt through the sanitizer,
 * whichever format it came in, so a file can only ever add good shapes.
 */
export function readLibraryFile(
  text: string,
  genId: () => string,
  title = 'Item',
): LibraryFile | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  return readLibraryData(data, genId, title);
}

/**
 * `title` names the items that have no name and no words of their own:
 * "Network icons 3" says more than "4 shapes" does.
 */
export function readLibraryData(
  data: unknown,
  genId: () => string,
  title = 'Item',
): LibraryFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const file = data as Record<string, unknown>;

  if (file.type === 'canvasflow/library' && Array.isArray(file.items)) {
    return collect(
      'canvasflow',
      title,
      file.items.map((raw) => {
        const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
          string,
          unknown
        >;
        return {
          name: item.name,
          shapes: Array.isArray(item.shapes) ? readLibraryShapes(item.shapes, genId).shapes : [],
          images: 0,
        };
      }),
    );
  }

  if (file.type === 'excalidrawlib' || Array.isArray(file.libraryItems)) {
    // Version 2: items with names. Version 1: bare lists of elements.
    const raws: { name?: unknown; elements: unknown }[] = Array.isArray(file.libraryItems)
      ? file.libraryItems.map((raw) => {
          const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
            string,
            unknown
          >;
          return { name: item.name, elements: item.elements };
        })
      : Array.isArray(file.library)
        ? file.library.map((elements) => ({ elements }))
        : [];
    if (raws.length === 0 && !Array.isArray(file.libraryItems) && !Array.isArray(file.library)) {
      return null;
    }

    return collect(
      'excalidraw',
      title,
      raws.map(({ name, elements }) => {
        const list = (Array.isArray(elements) ? elements : []).filter(
          (el): el is ExcalidrawElement => typeof el === 'object' && el !== null,
        );
        const drawn = excalidrawElementsToShapes(list, genId);
        return {
          name,
          // Through the sanitizer like everything else, as plain data.
          shapes: readLibraryShapes(JSON.parse(JSON.stringify(drawn)) as unknown[], genId).shapes,
          images: list.filter((el) => el.type === 'image' && el.isDeleted !== true).length,
        };
      }),
    );
  }

  return null;
}

function collect(
  format: LibraryFile['format'],
  title: string,
  raws: { name: unknown; shapes: Shape[]; images: number }[],
): LibraryFile {
  const items: LibraryFileItem[] = [];
  let emptyItems = 0;
  let imagesLeftOut = 0;
  raws.forEach((raw, index) => {
    imagesLeftOut += raw.images;
    if (raw.shapes.length === 0) {
      emptyItems += 1;
      return;
    }
    items.push({
      name: itemName(raw.name, raw.shapes, `${title} ${index + 1}`),
      shapes: raw.shapes,
    });
  });
  return { format, items, emptyItems, imagesLeftOut };
}

function itemName(name: unknown, shapes: readonly Shape[], fallback: string): string {
  const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (clean === '') return wordedItemName(shapes) ?? fallback.slice(0, LIBRARY_NAME_MAX);
  return clean.length > LIBRARY_NAME_MAX ? `${clean.slice(0, LIBRARY_NAME_MAX - 1)}…` : clean;
}

/** Items as this editor's library file. */
export function writeLibraryFile(
  items: readonly { name: string; shapes: readonly Shape[] }[],
): string {
  return JSON.stringify(
    {
      type: 'canvasflow/library',
      version: 1,
      items: items.map((item) => ({ name: item.name, shapes: item.shapes })),
    },
    null,
    2,
  );
}

/**
 * The items the gateway will take, and how many it would not: one with more
 * shapes, or more bytes of them, than an item may have.
 */
export function importableItems(items: readonly LibraryFileItem[]): {
  fit: LibraryFileItem[];
  tooLarge: number;
} {
  const encoder = new TextEncoder();
  const fit = items.filter(
    (item) =>
      item.shapes.length <= ITEM_MAX_SHAPES &&
      encoder.encode(JSON.stringify(item.shapes)).length <= ITEM_MAX_BYTES,
  );
  return { fit, tooLarge: items.length - fit.length };
}
