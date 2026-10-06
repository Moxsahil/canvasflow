import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  addedLibraries,
  libraryItems,
  type AddedLibraryRow,
  type LibraryItemRow,
} from '../schema/library.js';

/** Long enough for "Payments service (v2)", short enough to fit under a thumbnail. */
export const LIBRARY_NAME_MAX = 80;
/** Shapes in one item. A diagram's worth, not a board's. */
export const LIBRARY_ITEM_MAX_SHAPES = 500;
/** One item's shapes as JSON. A long freehand stroke is the largest common thing. */
export const LIBRARY_ITEM_MAX_BYTES = 200 * 1024;
/**
 * A whole library. The editor reads all of it in one request, so this is
 * also the ceiling on that request.
 */
export const LIBRARY_MAX_BYTES = 5 * 1024 * 1024;
/** Items in one import request. A file with more is sent in several. */
export const LIBRARY_IMPORT_MAX_ITEMS = 100;
/** Catalogue libraries one account can have added. */
export const ADDED_LIBRARIES_MAX = 50;

export interface LibraryItem {
  id: string;
  name: string;
  shapes: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface LibraryItemInput {
  name: string;
  shapes: unknown[];
  sizeBytes: number;
}

export type ParsedLibraryInput =
  | { readonly ok: true; readonly value: LibraryItemInput }
  | { readonly ok: false; readonly error: string };

/** A name as stored: trimmed, and within bounds, or the reason it is not. */
export function parseLibraryName(
  value: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'A name is needed' };
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length === 0) return { ok: false, error: 'A name is needed' };
  if (name.length > LIBRARY_NAME_MAX) {
    return { ok: false, error: `Names are at most ${LIBRARY_NAME_MAX} characters` };
  }
  return { ok: true, name };
}

/**
 * What a request to keep something in the library may hold.
 *
 * Only the outline is checked: a name, and a list of objects that each say
 * what kind of shape they are. Whether those are good shapes is decided by
 * the editor as it reads them back, through the same sanitizer a board file
 * goes through — so nothing stored here is ever drawn as it was sent.
 */
export function parseLibraryItemInput(body: unknown): ParsedLibraryInput {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Nothing to keep' };
  const { name, shapes } = body as { name?: unknown; shapes?: unknown };

  const parsedName = parseLibraryName(name);
  if (!parsedName.ok) return parsedName;

  if (!Array.isArray(shapes) || shapes.length === 0) {
    return { ok: false, error: 'An item needs at least one shape' };
  }
  if (shapes.length > LIBRARY_ITEM_MAX_SHAPES) {
    return { ok: false, error: `An item holds at most ${LIBRARY_ITEM_MAX_SHAPES} shapes` };
  }
  for (const shape of shapes) {
    if (typeof shape !== 'object' || shape === null || Array.isArray(shape)) {
      return { ok: false, error: 'That is not a shape' };
    }
    if (typeof (shape as { kind?: unknown }).kind !== 'string') {
      return { ok: false, error: 'That is not a shape' };
    }
  }

  const sizeBytes = Buffer.byteLength(JSON.stringify(shapes), 'utf8');
  if (sizeBytes > LIBRARY_ITEM_MAX_BYTES) {
    return { ok: false, error: 'That is too large to keep in the library' };
  }
  return { ok: true, value: { name: parsedName.name, shapes, sizeBytes } };
}

/**
 * A request to keep several items at once — a library file, read in the
 * editor. All of it is checked as one item would be, and any item that fails
 * fails the request: the editor leaves out what it knows will not pass.
 */
export function parseLibraryImportInput(
  body: unknown,
): { ok: true; value: LibraryItemInput[] } | { ok: false; error: string } {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Nothing to import' };
  }
  if (items.length > LIBRARY_IMPORT_MAX_ITEMS) {
    return { ok: false, error: `Send at most ${LIBRARY_IMPORT_MAX_ITEMS} items at a time` };
  }
  const value: LibraryItemInput[] = [];
  for (const item of items) {
    const parsed = parseLibraryItemInput(item);
    if (!parsed.ok) return parsed;
    value.push(parsed.value);
  }
  return { ok: true, value };
}

function toItem(row: LibraryItemRow): LibraryItem {
  return {
    id: row.id,
    name: row.name,
    shapes: Array.isArray(row.shapes) ? row.shapes : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Everything in one person's library, newest first. */
export async function listLibraryItems(db: Database, ownerId: string): Promise<LibraryItem[]> {
  const rows = await db
    .select()
    .from(libraryItems)
    .where(eq(libraryItems.ownerId, ownerId))
    .orderBy(desc(libraryItems.createdAt));
  return rows.map(toItem);
}

/**
 * Keep something in one person's library, unless it would take the library
 * past its size. The check and the write are not one statement, so two saves
 * racing each other can pass it together; the overshoot is one item at most.
 */
export async function createLibraryItem(
  db: Database,
  ownerId: string,
  input: LibraryItemInput,
): Promise<{ ok: true; item: LibraryItem } | { ok: false; reason: 'full' }> {
  const [usage] = await db
    .select({ bytes: sql<number>`coalesce(sum(${libraryItems.sizeBytes}), 0)::int` })
    .from(libraryItems)
    .where(eq(libraryItems.ownerId, ownerId));
  if ((usage?.bytes ?? 0) + input.sizeBytes > LIBRARY_MAX_BYTES)
    return { ok: false, reason: 'full' };

  const [row] = await db
    .insert(libraryItems)
    .values({ ownerId, name: input.name, shapes: input.shapes, sizeBytes: input.sizeBytes })
    .returning();
  return { ok: true, item: toItem(row!) };
}

/**
 * Keep several items at once, unless together they would take the library
 * past its size — in which case none of them are kept.
 *
 * They are stamped a millisecond apart, first newest, so a library listed
 * newest first lists them in the order the file had them.
 */
export async function importLibraryItems(
  db: Database,
  ownerId: string,
  inputs: readonly LibraryItemInput[],
): Promise<{ ok: true; items: LibraryItem[] } | { ok: false; reason: 'full' }> {
  const [usage] = await db
    .select({ bytes: sql<number>`coalesce(sum(${libraryItems.sizeBytes}), 0)::int` })
    .from(libraryItems)
    .where(eq(libraryItems.ownerId, ownerId));
  const adding = inputs.reduce((total, input) => total + input.sizeBytes, 0);
  if ((usage?.bytes ?? 0) + adding > LIBRARY_MAX_BYTES) return { ok: false, reason: 'full' };

  const now = Date.now();
  const rows = await db
    .insert(libraryItems)
    .values(
      inputs.map((input, i) => {
        const at = new Date(now - i);
        return {
          ownerId,
          name: input.name,
          shapes: input.shapes,
          sizeBytes: input.sizeBytes,
          createdAt: at,
          updatedAt: at,
        };
      }),
    )
    .returning();
  return { ok: true, items: rows.map(toItem) };
}

/** Rename an item of this person's. Null when they have none by that id. */
export async function renameLibraryItem(
  db: Database,
  ownerId: string,
  id: string,
  name: string,
): Promise<LibraryItem | null> {
  const [row] = await db
    .update(libraryItems)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(libraryItems.id, id), eq(libraryItems.ownerId, ownerId)))
    .returning();
  return row ? toItem(row) : null;
}

/** Remove an item of this person's. False when they have none by that id. */
export async function deleteLibraryItem(
  db: Database,
  ownerId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(libraryItems)
    .where(and(eq(libraryItems.id, id), eq(libraryItems.ownerId, ownerId)))
    .returning({ id: libraryItems.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Libraries added from the public catalogue
// ---------------------------------------------------------------------------

export interface AddedLibrary {
  id: string;
  catalogueId: string;
  name: string;
  source: string;
  credit: string;
  createdAt: string;
}

export interface AddedLibraryInput {
  catalogueId: string;
  name: string;
  source: string;
  credit: string;
}

/**
 * A library file's path in the catalogue: folders and a file name, each of
 * plain characters, ending in the library extension. No dot-only segments,
 * so a path cannot climb out of the catalogue's library folder.
 */
const CATALOGUE_SOURCE =
  /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.excalidrawlib$/;
const CATALOGUE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CREDIT_MAX = 200;

export function parseAddedLibraryInput(
  body: unknown,
): { ok: true; value: AddedLibraryInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Nothing to add' };
  const { catalogueId, name, source, credit } = body as Record<string, unknown>;

  if (typeof catalogueId !== 'string' || !CATALOGUE_ID.test(catalogueId)) {
    return { ok: false, error: 'That is not a library from the catalogue' };
  }
  if (typeof source !== 'string' || source.length > 300 || !CATALOGUE_SOURCE.test(source)) {
    return { ok: false, error: 'That is not a library from the catalogue' };
  }
  const parsedName = parseLibraryName(name);
  if (!parsedName.ok) return parsedName;
  const parsedCredit =
    typeof credit === 'string' ? credit.trim().replace(/\s+/g, ' ').slice(0, CREDIT_MAX) : '';

  return {
    ok: true,
    value: { catalogueId, name: parsedName.name, source, credit: parsedCredit },
  };
}

function toAddedLibrary(row: AddedLibraryRow): AddedLibrary {
  return {
    id: row.id,
    catalogueId: row.catalogueId,
    name: row.name,
    source: row.source,
    credit: row.credit,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The catalogue libraries one person has added, in the order they added them. */
export async function listAddedLibraries(db: Database, ownerId: string): Promise<AddedLibrary[]> {
  const rows = await db
    .select()
    .from(addedLibraries)
    .where(eq(addedLibraries.ownerId, ownerId))
    .orderBy(asc(addedLibraries.createdAt));
  return rows.map(toAddedLibrary);
}

/**
 * Add a catalogue library to one person's. Adding one already there answers
 * with the one there, so a second click is harmless.
 */
export async function addLibrary(
  db: Database,
  ownerId: string,
  input: AddedLibraryInput,
): Promise<{ ok: true; library: AddedLibrary } | { ok: false; reason: 'full' }> {
  const [existing] = await db
    .select()
    .from(addedLibraries)
    .where(and(eq(addedLibraries.ownerId, ownerId), eq(addedLibraries.source, input.source)));
  if (existing) return { ok: true, library: toAddedLibrary(existing) };

  const [held] = await db
    .select({ n: count() })
    .from(addedLibraries)
    .where(eq(addedLibraries.ownerId, ownerId));
  if ((held?.n ?? 0) >= ADDED_LIBRARIES_MAX) return { ok: false, reason: 'full' };

  const [row] = await db
    .insert(addedLibraries)
    .values({ ownerId, ...input })
    // Two adds racing each other: the second finds the first's row.
    .onConflictDoNothing({ target: [addedLibraries.ownerId, addedLibraries.source] })
    .returning();
  if (row) return { ok: true, library: toAddedLibrary(row) };
  const [raced] = await db
    .select()
    .from(addedLibraries)
    .where(and(eq(addedLibraries.ownerId, ownerId), eq(addedLibraries.source, input.source)));
  return { ok: true, library: toAddedLibrary(raced!) };
}

/** Take a catalogue library out of one person's. False when they had none by that id. */
export async function removeAddedLibrary(
  db: Database,
  ownerId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(addedLibraries)
    .where(and(eq(addedLibraries.id, id), eq(addedLibraries.ownerId, ownerId)))
    .returning({ id: addedLibraries.id });
  return rows.length > 0;
}
