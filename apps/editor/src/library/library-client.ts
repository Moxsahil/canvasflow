import type { Shape } from '@canvasflow/canvas-engine';
import { env } from '@/lib/env';

/**
 * A person's library, from the API gateway.
 *
 * What comes back is as the gateway kept it, which is only checked for its
 * outline: `shapes` is read through `readLibraryShapes` before anything draws
 * it or puts it on a board.
 */

export interface StoredLibraryItem {
  id: string;
  name: string;
  shapes: unknown[];
  createdAt: string;
  updatedAt: string;
}

export class LibraryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function request(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${env.VITE_API_URL}/library${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

/** The gateway's own words where it gave any, since they say what to do. */
async function failure(res: Response): Promise<LibraryError> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  if (res.status === 401) {
    return new LibraryError('Your session has ended. Sign in again.', 401);
  }
  const message =
    typeof body?.message === 'string'
      ? body.message
      : `Something went wrong with the library (${res.status}).`;
  return new LibraryError(message, res.status);
}

export async function fetchLibraryItems(token: string): Promise<StoredLibraryItem[]> {
  const res = await request('/items', token);
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: StoredLibraryItem[] }).data;
}

export async function createLibraryItem(
  token: string,
  input: { name: string; shapes: readonly Shape[] },
): Promise<StoredLibraryItem> {
  const res = await request('/items', token, { method: 'POST', body: JSON.stringify(input) });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: StoredLibraryItem }).data;
}

export async function renameLibraryItem(
  token: string,
  id: string,
  name: string,
): Promise<StoredLibraryItem> {
  const res = await request(`/items/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: StoredLibraryItem }).data;
}

export async function deleteLibraryItem(token: string, id: string): Promise<void> {
  const res = await request(`/items/${encodeURIComponent(id)}`, token, { method: 'DELETE' });
  // Already gone is what was asked for.
  if (!res.ok && res.status !== 404) throw await failure(res);
}

/** Several items at once. All of them are kept, or none (409 when there is no room). */
export async function importLibraryItems(
  token: string,
  items: readonly { name: string; shapes: readonly Shape[] }[],
): Promise<StoredLibraryItem[]> {
  const res = await request('/items/import', token, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: StoredLibraryItem[] }).data;
}

/** A library added from the public catalogue: which one, never what is in it. */
export interface AddedLibrary {
  id: string;
  catalogueId: string;
  name: string;
  source: string;
  credit: string;
  createdAt: string;
}

export async function fetchAddedLibraries(token: string): Promise<AddedLibrary[]> {
  const res = await request('/added', token);
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: AddedLibrary[] }).data;
}

export async function addCatalogueLibrary(
  token: string,
  input: { catalogueId: string; name: string; source: string; credit: string },
): Promise<AddedLibrary> {
  const res = await request('/added', token, { method: 'POST', body: JSON.stringify(input) });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: AddedLibrary }).data;
}

export async function removeAddedLibrary(token: string, id: string): Promise<void> {
  const res = await request(`/added/${encodeURIComponent(id)}`, token, { method: 'DELETE' });
  // Already gone is what was asked for.
  if (!res.ok && res.status !== 404) throw await failure(res);
}
