import { useCallback, useEffect, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { BoardDocument } from '@canvasflow/canvas-engine';

export interface OfflineCache {
  /**
   * True once the cache for the CURRENT (user, board) has settled — either
   * replayed or determined unavailable.
   */
  readonly hydrated: boolean;
  /**
   * Throw the cached copy away.
   *
   * For the one case where the board stops being this person's to hold: a
   * revoked collaborator whose cache would otherwise repaint the whole board
   * on their next visit to the URL, with no server left to correct it.
   */
  readonly purge: () => void;
}

/**
 * Mirrors the board document into IndexedDB so it outlives the tab.
 *
 * The Y.Doc is already an offline buffer: edits made with the socket down
 * accumulate in memory and the sync protocol ships exactly the missing
 * operations on reconnect. What it was not is durable — that buffer died
 * with the page, so editing offline and then hitting refresh lost the work
 * silently. IndexedDB gives it a lifetime longer than the tab's.
 *
 * This does NOT make local state authoritative. Whatever is cached here is
 * merged with the server's copy by the usual CRDT sync on reconnect, and
 * both sides converge on everything either one was missing.
 *
 * The store is namespaced per (userId, boardId) so that on a shared
 * machine one account's cached board content is not readable by the next
 * person to sign in.
 *
 * Returns the settled flag for the CURRENT (user, board), plus the way to
 * discard what has been stored.
 */
export function useOfflineCache(
  doc: BoardDocument,
  boardId: string,
  userId: string | null,
): OfflineCache {
  // Tracks WHICH cache has settled rather than a bare boolean.
  //
  // A boolean has to be reset to false when the identity changes, and that
  // reset lands in an effect — one render after the identity itself
  // changed. Anything gating on the flag therefore observes a stale `true`
  // for exactly one render, acts on it, and gets torn down immediately
  // after. Comparing keys instead means the value goes straight from
  // "settled for the old key" to "not settled for the new one", with no
  // window in between: the token arriving flips userId and invalidates
  // this in the same render.
  const [settledKey, setSettledKey] = useState<string | null>(null);
  // The live provider, so purging can go through it. Deleting the database
  // out from under an open connection blocks on that connection instead.
  const providerRef = useRef<IndexeddbPersistence | null>(null);

  // Namespaced per user so a shared machine never leaks one account's
  // cached board content to the next person who signs in.
  const key = userId ? `canvasflow:${userId}:${boardId}` : null;

  useEffect(() => {
    // No user means no namespace to store under, and caching board content
    // outside a user scope is exactly what the namespacing prevents.
    if (!key) {
      setSettledKey(null);
      return;
    }

    let cancelled = false;
    const settle = () => {
      if (!cancelled) setSettledKey(key);
    };

    let provider: IndexeddbPersistence;
    try {
      provider = new IndexeddbPersistence(key, doc.yDoc);
      providerRef.current = provider;
    } catch {
      // Private browsing can make IndexedDB throw on open rather than
      // reject. Treat it as settled-without-a-cache: the editor must still
      // load, just without offline durability. Failing to settle here
      // would leave the board waiting on a cache that will never arrive.
      settle();
      return;
    }

    // Private browsing, storage disabled, quota exhausted — same handling
    // either way, because the caller only needs to know the wait is over.
    provider.whenSynced.then(settle, settle);

    return () => {
      cancelled = true;
      if (providerRef.current === provider) providerRef.current = null;
      // destroy() detaches the observer but leaves the stored data behind,
      // which is the entire point of caching it.
      void provider.destroy();
    };
  }, [doc, key]);

  const purge = useCallback(() => {
    const provider = providerRef.current;
    providerRef.current = null;
    // clearData() destroys the provider as well as the store, so the deletion
    // isn't left waiting on our own open connection to it.
    if (provider) void provider.clearData();
  }, []);

  // No user: nothing to wait for, so never block on a cache we won't build.
  return { hydrated: key === null || settledKey === key, purge };
}
