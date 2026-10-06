import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { libraryItems, type LibraryItemRow } from '../schema/library.js';

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
