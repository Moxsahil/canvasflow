import { readLibraryData, type LibraryFile } from './library-files';
import type { LibraryEntry } from './useLibrary';

/**
 * The public library catalogue: libraries people have published for anyone
 * to use, under the MIT licence, served with CORS open to every site. Its
 * index lists them; each library is one file beside it.
 */
export const CATALOGUE_URL = 'https://libraries.excalidraw.com';

export interface CatalogueAuthor {
  readonly name: string;
  readonly url: string | null;
}

export interface CatalogueLibrary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly authors: readonly CatalogueAuthor[];
  /** The library file's path in the catalogue. */
  readonly source: string;
  /** A picture of the whole library, by its path in the catalogue. */
  readonly preview: string | null;
  /** When it last changed, as the catalogue dates it (YYYY-MM-DD). */
  readonly updated: string;
}

/** The same rule the gateway holds a stored path to. */
const SOURCE = /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.excalidrawlib$/;
const PREVIEW =
  /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp|svg)$/i;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/**
 * The catalogue's index, as entries this editor can trust: anything without a
 * name and a file path that stays inside the catalogue is dropped.
 * Most recently updated first.
 */
export function parseCatalogue(data: unknown): CatalogueLibrary[] {
  if (!Array.isArray(data)) return [];
  const libraries: CatalogueLibrary[] = [];
  for (const raw of data) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const name = text(entry.name, 80);
    if (name === '') continue;
    if (typeof entry.source !== 'string' || !SOURCE.test(entry.source)) continue;
    // Not every entry has an id of its own; the file's path names it as well.
    const id =
      typeof entry.id === 'string' && ID.test(entry.id)
        ? entry.id
        : entry.source
            .replace(/\.excalidrawlib$/, '')
            .replace(/[^A-Za-z0-9_-]/g, '-')
            .slice(0, 64);

    const authors = (Array.isArray(entry.authors) ? entry.authors : []).flatMap((author) => {
      if (typeof author !== 'object' || author === null) return [];
      const { name: authorName, url } = author as Record<string, unknown>;
      const clean = text(authorName, 80);
      if (clean === '') return [];
      return [
        { name: clean, url: typeof url === 'string' && /^https?:\/\//.test(url) ? url : null },
      ];
    });

    libraries.push({
      id,
      name,
      description: text(entry.description, 300),
      authors,
      source: entry.source,
      preview:
        typeof entry.preview === 'string' && PREVIEW.test(entry.preview) ? entry.preview : null,
      updated: text(entry.updated, 10),
    });
  }
  return libraries.sort((a, b) => b.updated.localeCompare(a.updated));
}

export function isCatalogueSource(source: string): boolean {
  return SOURCE.test(source);
}

/** Where a library's file is: always inside the catalogue's library folder. */
export function catalogueFileUrl(source: string): string | null {
  return SOURCE.test(source) ? `${CATALOGUE_URL}/libraries/${source}` : null;
}

export function cataloguePreviewUrl(preview: string | null): string | null {
  return preview && PREVIEW.test(preview) ? `${CATALOGUE_URL}/libraries/${preview}` : null;
}

/** Who made a library, as a line: "Ada", "Ada and Grace", "Ada, Grace and Alan". */
export function catalogueCredit(authors: readonly CatalogueAuthor[]): string {
  const names = authors.map((author) => author.name);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

let index: Promise<CatalogueLibrary[]> | null = null;

/**
 * The catalogue's index, read once a session. A failure is not kept, so the
 * next look tries again.
 */
export function fetchCatalogue(): Promise<CatalogueLibrary[]> {
  index ??= fetch(`${CATALOGUE_URL}/libraries.json`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`The catalogue answered ${res.status}`);
      return parseCatalogue(await res.json());
    })
    .catch((err: unknown) => {
      index = null;
      throw err;
    });
  return index;
}

const files = new Map<string, Promise<LibraryFile>>();

/**
 * A catalogue library's items, read when it is first opened and kept for the
 * session. A failure is not kept.
 */
export function fetchCatalogueLibrary(
  source: string,
  genId: () => string,
  title?: string,
): Promise<LibraryFile> {
  const cached = files.get(source);
  if (cached) return cached;

  const url = catalogueFileUrl(source);
  const loading = (
    url
      ? fetch(url).then(async (res) => {
          if (!res.ok) throw new Error(`The catalogue answered ${res.status}`);
          const file = readLibraryData(await res.json(), genId, title);
          if (!file) throw new Error('That is not a library file');
          return file;
        })
      : Promise.reject(new Error('That is not a library from the catalogue'))
  ).catch((err: unknown) => {
    files.delete(source);
    throw err;
  });
  files.set(source, loading);
  return loading;
}

/** A catalogue library's items as the panel shows them, under ids Recently used can name. */
export interface CatalogueItems {
  readonly entries: readonly LibraryEntry[];
  readonly imagesLeftOut: number;
}

const opened = new Map<string, LibraryEntry>();

export async function catalogueItems(
  source: string,
  genId: () => string,
  title?: string,
): Promise<CatalogueItems> {
  const file = await fetchCatalogueLibrary(source, genId, title);
  const entries = file.items.map((item, index) => {
    const id = `catalogue:${source}:${index}`;
    const entry = opened.get(id) ?? { id, name: item.name, shapes: item.shapes };
    opened.set(id, entry);
    return entry;
  });
  return { entries, imagesLeftOut: file.imagesLeftOut };
}

/** An item of a catalogue library opened this session, by its id. */
export function openedCatalogueEntry(id: string): LibraryEntry | null {
  return opened.get(id) ?? null;
}
