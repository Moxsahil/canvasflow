import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Shape } from '@canvasflow/canvas-engine';
import {
  addCatalogueLibrary,
  createLibraryItem,
  deleteLibraryItem,
  fetchAddedLibraries,
  fetchLibraryItems,
  importLibraryItems,
  LibraryError,
  removeAddedLibrary,
  renameLibraryItem,
  type AddedLibrary,
  type StoredLibraryItem,
} from './library-client';
import { catalogueCredit, type CatalogueLibrary } from './library-catalogue';
import { importableItems, type LibraryFileItem } from './library-files';
import { readLibraryShapes } from './library-items';
import { readRecentItems, storeRecentItems, withRecentItem } from './library-storage';

/** One item, with its shapes rebuilt and ready to draw or place. */
export interface LibraryEntry {
  readonly id: string;
  readonly name: string;
  readonly shapes: readonly Shape[];
}

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

export type { AddedLibrary };

/** How an import went. */
export interface ImportResult {
  readonly imported: number;
  /** Items too large for the library, left out. */
  readonly tooLarge: number;
  /** Why the rest did not go in, where some did not. */
  readonly error: string | null;
}

/** One import request: well under the gateway's 2 MB body and its item count. */
const IMPORT_BATCH_ITEMS = 100;
const IMPORT_BATCH_BYTES = 1.5 * 1024 * 1024;

export interface Library {
  /** Off for a guest, who has no account to keep a library in. */
  readonly enabled: boolean;
  readonly status: LibraryStatus;
  /** Why the list could not be read, while `status` is 'error'. */
  readonly error: string | null;
  /** Newest first. */
  readonly items: readonly LibraryEntry[];
  /** Ids of items placed lately, most recent first. Some may since have gone. */
  readonly recent: readonly string[];
  /** Libraries added from the public catalogue, in the order they were added. */
  readonly added: readonly AddedLibrary[];
  /** Read the list, the first time it is wanted, or again after a failure. */
  load: () => void;
  /** Keep these shapes under this name. Throws a `LibraryError` it did not. */
  add: (shapes: readonly Shape[], name: string) => Promise<LibraryEntry>;
  /** Shown under the new name at once, and put back if the gateway refuses. */
  rename: (id: string, name: string) => Promise<void>;
  /** Gone at once, and put back if the gateway refuses. */
  remove: (id: string) => Promise<void>;
  /** Say an item was just placed, for Recently used. */
  markUsed: (id: string) => void;
  /** Keep a library file's items. Says how many went in, and why any did not. */
  importItems: (items: readonly LibraryFileItem[]) => Promise<ImportResult>;
  /** Add a catalogue library. Throws a `LibraryError` it did not. */
  addFromCatalogue: (library: CatalogueLibrary) => Promise<AddedLibrary>;
  /** Gone at once, and put back if the gateway refuses. */
  removeAdded: (id: string) => Promise<void>;
}

// Only for telling an item's own shapes apart: every shape gets a fresh id
// again as it is placed.
let nextShapeId = 0;
const itemShapeId = () => `library-${(nextShapeId += 1)}`;

function entryFrom(item: StoredLibraryItem): LibraryEntry {
  return {
    id: item.id,
    name: item.name,
    shapes: readLibraryShapes(item.shapes, itemShapeId).shapes,
  };
}

/**
 * The library of the account signed in, read when it is first opened rather
 * than with the board: most visits to a board never look at it.
 */
export function useLibrary({
  userId,
  token,
  isGuest,
}: {
  userId: string | null;
  token: string | null;
  isGuest: boolean;
}): Library {
  const enabled = userId !== null && token !== null && !isGuest;
  const [status, setStatus] = useState<LibraryStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<readonly LibraryEntry[]>([]);
  const [recent, setRecent] = useState<readonly string[]>([]);
  const [added, setAdded] = useState<readonly AddedLibrary[]>([]);

  // The token is refreshed under a running board; a request made after that
  // wants the new one, without every callback being rebuilt for it.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const addedRef = useRef(added);
  useEffect(() => {
    addedRef.current = added;
  }, [added]);

  // Another account in the same tab starts from nothing.
  useEffect(() => {
    setStatus('idle');
    setError(null);
    setItems([]);
    setAdded([]);
    setRecent(userId ? readRecentItems(userId) : []);
  }, [userId]);

  const loading = useRef(false);
  const load = useCallback(() => {
    const current = tokenRef.current;
    if (!enabled || !current || loading.current) return;
    loading.current = true;
    setStatus((was) => (was === 'ready' ? was : 'loading'));
    Promise.all([fetchLibraryItems(current), fetchAddedLibraries(current)])
      .then(([stored, libraries]) => {
        setItems(stored.map(entryFrom));
        setAdded(libraries);
        setStatus('ready');
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof LibraryError ? err.message : 'Couldn’t reach your library. Try again.',
        );
        setStatus((was) => (was === 'ready' ? was : 'error'));
      })
      .finally(() => {
        loading.current = false;
      });
  }, [enabled]);

  const add = useCallback(
    async (shapes: readonly Shape[], name: string) => {
      const current = tokenRef.current;
      if (!enabled || !current)
        throw new LibraryError('Sign up to keep a library of your own', 403);
      const entry = entryFrom(await createLibraryItem(current, { name, shapes }));
      setItems((was) => [entry, ...was.filter((item) => item.id !== entry.id)]);
      return entry;
    },
    [enabled],
  );

  const rename = useCallback(async (id: string, name: string) => {
    const current = tokenRef.current;
    const before = itemsRef.current.find((item) => item.id === id);
    if (!current || !before || before.name === name) return;
    setItems((was) => was.map((item) => (item.id === id ? { ...item, name } : item)));
    try {
      const saved = await renameLibraryItem(current, id, name);
      setItems((was) => was.map((item) => (item.id === id ? { ...item, name: saved.name } : item)));
    } catch (err) {
      setItems((was) =>
        was.map((item) => (item.id === id ? { ...item, name: before.name } : item)),
      );
      throw err;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    const current = tokenRef.current;
    const at = itemsRef.current.findIndex((item) => item.id === id);
    const removed = itemsRef.current[at];
    if (!current || !removed) return;
    setItems((was) => was.filter((item) => item.id !== id));
    try {
      await deleteLibraryItem(current, id);
    } catch (err) {
      // Back where it was, unless the list has since been read afresh.
      setItems((was) => {
        if (was.some((item) => item.id === id)) return was;
        const next = [...was];
        next.splice(Math.min(at, next.length), 0, removed);
        return next;
      });
      throw err;
    }
  }, []);

  const markUsed = useCallback(
    (id: string) => {
      setRecent((was) => {
        const next = withRecentItem(was, id);
        if (userId) storeRecentItems(userId, next);
        return next;
      });
    },
    [userId],
  );

  const importItems = useCallback(
    async (fileItems: readonly LibraryFileItem[]): Promise<ImportResult> => {
      const current = tokenRef.current;
      if (!enabled || !current) {
        return { imported: 0, tooLarge: 0, error: 'Sign up to keep a library of your own' };
      }
      const { fit, tooLarge } = importableItems(fileItems);

      // A request at a time, each well inside the gateway's limits. The last
      // batch goes first: each is stamped newer than the one before, and the
      // library lists newest first, so the file's first item ends up on top.
      // One the gateway refuses stops the rest, and the reason is said.
      const batches: LibraryFileItem[][] = [];
      let batch: LibraryFileItem[] = [];
      let bytes = 0;
      for (const item of fit) {
        const size = JSON.stringify(item).length;
        if (
          batch.length >= IMPORT_BATCH_ITEMS ||
          (batch.length > 0 && bytes + size > IMPORT_BATCH_BYTES)
        ) {
          batches.push(batch);
          batch = [];
          bytes = 0;
        }
        batch.push(item);
        bytes += size;
      }
      if (batch.length > 0) batches.push(batch);

      let imported = 0;
      for (const next of batches.reverse()) {
        try {
          const entries = (await importLibraryItems(current, next)).map(entryFrom);
          imported += entries.length;
          setItems((was) => [...entries, ...was]);
        } catch (err) {
          return {
            imported,
            tooLarge,
            error: err instanceof Error ? err.message : 'Couldn’t import the rest',
          };
        }
      }
      return { imported, tooLarge, error: null };
    },
    [enabled],
  );

  const addFromCatalogue = useCallback(
    async (library: CatalogueLibrary) => {
      const current = tokenRef.current;
      if (!enabled || !current)
        throw new LibraryError('Sign up to keep a library of your own', 403);
      const saved = await addCatalogueLibrary(current, {
        catalogueId: library.id,
        name: library.name,
        source: library.source,
        credit: catalogueCredit(library.authors),
      });
      setAdded((was) => (was.some((other) => other.id === saved.id) ? was : [...was, saved]));
      return saved;
    },
    [enabled],
  );

  const removeAdded = useCallback(async (id: string) => {
    const current = tokenRef.current;
    const at = addedRef.current.findIndex((library) => library.id === id);
    const removed = addedRef.current[at];
    if (!current || !removed) return;
    setAdded((was) => was.filter((library) => library.id !== id));
    try {
      await removeAddedLibrary(current, id);
    } catch (err) {
      setAdded((was) => {
        if (was.some((library) => library.id === id)) return was;
        const next = [...was];
        next.splice(Math.min(at, next.length), 0, removed);
        return next;
      });
      throw err;
    }
  }, []);

  return useMemo(
    () => ({
      enabled,
      status,
      error,
      items,
      recent,
      added,
      load,
      add,
      rename,
      remove,
      markUsed,
      importItems,
      addFromCatalogue,
      removeAdded,
    }),
    [
      enabled,
      status,
      error,
      items,
      recent,
      added,
      load,
      add,
      rename,
      remove,
      markUsed,
      importItems,
      addFromCatalogue,
      removeAdded,
    ],
  );
}
