import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuChipClasses } from '@/components/ui/menu-look';
import {
  CATALOGUE_URL,
  catalogueCredit,
  cataloguePreviewUrl,
  type CatalogueLibrary,
} from './library-catalogue';
import { focusRing, mutedText, wash } from './LibraryTiles';
import { PanelNote } from './PanelNote';
import { useCatalogue } from './useCatalogue';
import type { AddedLibrary } from './useLibrary';

const outlinedChip = cn(menuChipClasses, 'border border-neutral-300 dark:border-neutral-600');

interface LibraryBrowseProps {
  query: string;
  added: readonly AddedLibrary[];
  /** An account to add libraries to. */
  canAdd: boolean;
  onAdd: (library: CatalogueLibrary) => Promise<void>;
  /** Show an added library's items. */
  onOpen: (added: AddedLibrary) => void;
}

/**
 * The public catalogue, searchable, with a way to add any of it.
 *
 * Adding keeps only which library it is; its items are read from the
 * catalogue whenever it is opened, and it sits down the left with the rest.
 */
export function LibraryBrowse({ query, added, canAdd, onAdd, onOpen }: LibraryBrowseProps) {
  const { state, retry } = useCatalogue(true);
  const [adding, setAdding] = useState<string | null>(null);

  if (state.status === 'loading') return <PanelNote title="Opening the library catalogue…" />;
  if (state.status === 'error') {
    return (
      <PanelNote title="Couldn’t open the library catalogue">
        {state.error}
        <button type="button" className={cn(outlinedChip, 'mt-2')} onClick={retry}>
          Try again
        </button>
      </PanelNote>
    );
  }

  const needle = query.trim().toLowerCase();
  // Libraries named for what was typed first, then those that only mention it.
  const named = (library: CatalogueLibrary) => library.name.toLowerCase().includes(needle);
  const shown = needle
    ? state.value
        .filter((library) =>
          [library.name, library.description, ...library.authors.map((a) => a.name)].some((field) =>
            field.toLowerCase().includes(needle),
          ),
        )
        .sort((a, b) => Number(named(b)) - Number(named(a)))
    : state.value;
  const addedBySource = new Map(added.map((library) => [library.source, library]));

  return (
    <div className="flex flex-col gap-2">
      {shown.length === 0 ? (
        <PanelNote title={`No library matches “${query.trim()}”`} />
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="Library catalogue">
          {shown.map((library) => {
            const preview = cataloguePreviewUrl(library.preview);
            const mine = addedBySource.get(library.source);
            const credit = catalogueCredit(library.authors);
            return (
              <li
                key={library.source}
                className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-neutral-300 p-1.5 dark:border-neutral-700"
                data-testid="catalogue-library"
              >
                <div className={cn('h-24 overflow-hidden rounded-md', wash)}>
                  {preview && (
                    <img
                      src={preview}
                      alt=""
                      loading="lazy"
                      // The previews are drawn for a white page; turned for a dark one.
                      className="size-full object-contain dark:hue-rotate-180 dark:invert-[.93]"
                    />
                  )}
                </div>
                <div className="flex min-w-0 items-start gap-2 px-0.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold" title={library.name}>
                      {library.name}
                    </p>
                    {credit && (
                      <p className={cn('truncate text-[11px]', mutedText)} title={credit}>
                        by {credit}
                      </p>
                    )}
                  </div>
                  {mine ? (
                    <button
                      type="button"
                      className={cn(outlinedChip, 'shrink-0 px-2')}
                      onClick={() => onOpen(mine)}
                    >
                      <Check aria-hidden="true" />
                      Open
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!canAdd || adding !== null}
                      className={cn(
                        'inline-flex h-7 shrink-0 items-center rounded-md bg-neutral-950 px-2.5 text-xs font-medium text-neutral-50 hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200',
                        focusRing,
                      )}
                      onClick={() => {
                        setAdding(library.id);
                        void onAdd(library).finally(() => setAdding(null));
                      }}
                      data-testid="catalogue-add"
                    >
                      {adding === library.id ? 'Adding…' : 'Add'}
                    </button>
                  )}
                </div>
                {library.description && (
                  <p className={cn('line-clamp-2 px-0.5 text-[11px]', mutedText)}>
                    {library.description}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className={cn('px-1 pb-1 text-[11px]', mutedText)}>
        From{' '}
        <a
          href={CATALOGUE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn('underline underline-offset-2', focusRing)}
        >
          libraries.excalidraw.com
        </a>
        , shared by the people who made them under the MIT licence.
      </p>
    </div>
  );
}
