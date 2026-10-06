import { useCallback, useEffect, useState } from 'react';
import {
  catalogueItems,
  fetchCatalogue,
  type CatalogueItems,
  type CatalogueLibrary,
} from './library-catalogue';

type Loaded<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly error: string };

const reason = (err: unknown) =>
  err instanceof TypeError
    ? 'Couldn’t reach the library catalogue. Check your connection.'
    : err instanceof Error
      ? err.message
      : 'Couldn’t reach the library catalogue.';

/** Something read from the catalogue, again on `retry`. Off while `active` is false. */
function useLoaded<T>(active: boolean, key: string, load: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    let current = true;
    setState({ status: 'loading' });
    load().then(
      (value) => {
        if (current) setState({ status: 'ready', value });
      },
      (err: unknown) => {
        if (current) setState({ status: 'error', error: reason(err) });
      },
    );
    return () => {
      current = false;
    };
    // `load` is rebuilt every render; what it reads is named by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}

/** The catalogue's index, while the Browse view is open. */
export function useCatalogue(active: boolean) {
  return useLoaded<CatalogueLibrary[]>(active, 'index', fetchCatalogue);
}

// Only for telling one item's shapes apart: every shape gets a fresh id again
// as it is placed.
let nextShapeId = 0;
const catalogueShapeId = () => `catalogue-${(nextShapeId += 1)}`;

/** An added library's items, while it is the one open. Unnamed items are named after it. */
export function useCatalogueItems(library: { source: string; name: string } | null) {
  return useLoaded<CatalogueItems>(library !== null, library?.source ?? '', () =>
    catalogueItems(library!.source, catalogueShapeId, library!.name),
  );
}
