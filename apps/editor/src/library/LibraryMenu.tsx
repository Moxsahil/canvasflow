import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Clock,
  Download,
  Ellipsis,
  Folder,
  Globe,
  LibraryBig,
  Package,
  Pin,
  Plus,
  Search,
  Upload,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  InlineDropdownMenu,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import { MenuBadge, menuChipClasses, menuSurfaceClasses } from '@/components/ui/menu-look';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { saveFile } from '../file/save-file';
import { openedCatalogueEntry, type CatalogueLibrary } from './library-catalogue';
import { LIBRARY_FILE_ACCEPT, readLibraryFile, writeLibraryFile } from './library-files';
import { LIBRARY_PACKS, type LibraryPack } from './library-packs';
import { readLibraryPinned, storeLibraryPinned } from './library-storage';
import { LibraryBrowse } from './LibraryBrowse';
import { TileGrid, focusRing, mutedText, wash, type TileActions } from './LibraryTiles';
import { PanelNote } from './PanelNote';
import { useCatalogueItems } from './useCatalogue';
import type { AddedLibrary, Library, LibraryEntry } from './useLibrary';

/** Larger than any library worth importing, and small enough to read without stalling the tab. */
const IMPORT_MAX_BYTES = 20 * 1024 * 1024;

type View =
  | { readonly kind: 'personal' }
  | { readonly kind: 'recent' }
  | { readonly kind: 'pack'; readonly id: string }
  | { readonly kind: 'added'; readonly id: string }
  | { readonly kind: 'browse' };

const PERSONAL: View = { kind: 'personal' };

type Notify = (message: string, tone?: 'warn') => void;

interface LibraryMenuProps {
  library: Library;
  darkMode: boolean;
  /** Something is selected that an item could be made of. */
  canAdd: boolean;
  /** False for a viewer, who can keep things from a board but not put them on it. */
  canPlace: boolean;
  /** Add what is selected. Says how it went itself. */
  onAdd: () => Promise<void>;
  /** Place an item in the middle of the view. */
  onPlace: (entry: LibraryEntry) => void;
  /** Say how something went: an import, an export, a failure. */
  onNotify: Notify;
  /** The editor root, which the panel portals into for its theme. */
  container: HTMLElement | null;
}

/**
 * The library button, in the top-right dock beside comments, and what it
 * opens: the libraries down the left, the chosen one's items on the right.
 *
 * Picking an item puts it in the middle of the view; dragging one puts it
 * where it is let go. Either closes the panel, unless it is pinned open for
 * placing several. Add selection, at the foot, keeps what is selected.
 */
export function LibraryMenu({
  library,
  darkMode,
  canAdd,
  canPlace,
  onAdd,
  onPlace,
  onNotify,
  container,
}: LibraryMenuProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(readLibraryPinned);
  const button = useRef<HTMLButtonElement>(null);
  const [overhang, setOverhang] = useState(0);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Hangs from the end of the dock, as the comments list does.
        const row = button.current?.parentElement;
        if (next && button.current && row) {
          setOverhang(
            row.getBoundingClientRect().right - button.current.getBoundingClientRect().right,
          );
        }
        if (next) library.load();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={button}
          type="button"
          aria-label="Library"
          title="Library"
          className="relative flex size-9 items-center justify-center rounded-full border border-(--default-border-color) bg-(--island-bg-color) text-(--icon-fill-color) transition-colors hover:bg-(--button-hover-bg) focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none data-[state=open]:bg-(--button-hover-bg)"
          data-testid="library-button"
        >
          <LibraryBig className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        align="end"
        alignOffset={-overhang}
        sideOffset={8}
        collisionPadding={8}
        aria-label="Library"
        className={cn(
          menuSurfaceClasses,
          'flex h-[min(420px,calc(100dvh-80px))] w-[min(620px,calc(100vw-16px))] flex-col p-0 shadow-none data-[state=open]:animate-none',
        )}
        // Keys pressed in here are the panel's: a letter typed into the search
        // must not pick up a tool on the board behind.
        onKeyDown={(event) => {
          if (event.key !== 'Escape') event.stopPropagation();
        }}
        // Escape while renaming an item gives up the new name, not the panel.
        onEscapeKeyDown={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[data-library-rename]')
          ) {
            event.preventDefault();
          }
        }}
        data-testid="library-panel"
      >
        <LibraryPanel
          library={library}
          darkMode={darkMode}
          canAdd={canAdd}
          canPlace={canPlace}
          pinned={pinned}
          onPin={(next) => {
            setPinned(next);
            storeLibraryPinned(next);
          }}
          onAdd={onAdd}
          onPlace={(entry) => {
            onPlace(entry);
            if (!pinned) setOpen(false);
          }}
          onDropped={() => {
            if (!pinned) setOpen(false);
          }}
          onNotify={onNotify}
          container={container}
        />
      </PopoverContent>
    </Popover>
  );
}

interface LibraryPanelProps {
  library: Library;
  darkMode: boolean;
  canAdd: boolean;
  canPlace: boolean;
  pinned: boolean;
  onPin: (pinned: boolean) => void;
  onAdd: () => Promise<void>;
  onPlace: (entry: LibraryEntry) => void;
  /** A tile was dragged onto the board and let go there. */
  onDropped: () => void;
  onNotify: Notify;
  container: HTMLElement | null;
  /** The packs down the left; the editor's own unless a test says otherwise. */
  packs?: readonly LibraryPack[];
  /** Where it opens. */
  initialView?: View;
}

/**
 * The panel itself, apart from the popover that holds it, so it can be drawn
 * and read on its own.
 */
export function LibraryPanel({
  library,
  darkMode,
  canAdd,
  canPlace,
  pinned,
  onPin,
  onAdd,
  onPlace,
  onDropped,
  onNotify,
  container,
  packs = LIBRARY_PACKS,
  initialView = PERSONAL,
}: LibraryPanelProps) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileOver, setFileOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const show = (next: View) => {
    setView(next);
    setQuery('');
  };

  const pack = view.kind === 'pack' ? packs.find((p) => p.id === view.id) : undefined;
  const addedLibrary =
    view.kind === 'added' ? library.added.find((a) => a.id === view.id) : undefined;
  const catalogue = useCatalogueItems(addedLibrary ?? null);

  // Personal items, pack items, and items of catalogue libraries opened this
  // session: an id from anywhere else is let go of quietly.
  const recentItems = useMemo(() => {
    const known = new Map<string, LibraryEntry>(library.items.map((item) => [item.id, item]));
    for (const p of packs) for (const item of p.items) known.set(item.id, item);
    return library.recent.flatMap((id) => known.get(id) ?? openedCatalogueEntry(id) ?? []);
    // Catalogue items come in as their libraries are opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.items, library.recent, packs, catalogue.state]);

  const notifyFailure = (fallback: string) => (err: unknown) =>
    onNotify(err instanceof Error ? err.message : fallback, 'warn');

  const keep = (entry: LibraryEntry) => () => {
    library
      .add(entry.shapes, entry.name)
      .then(() => onNotify(`Added “${entry.name}” to Personal`))
      .catch(notifyFailure('Couldn’t add that to your library'));
  };
  const personalActions = (entry: LibraryEntry): TileActions => ({
    rename: (name) => {
      library.rename(entry.id, name).catch(notifyFailure('Couldn’t rename that'));
    },
    remove: () => {
      library.remove(entry.id).catch(notifyFailure('Couldn’t delete that'));
    },
  });

  const importFile = async (file: File) => {
    if (file.size > IMPORT_MAX_BYTES) {
      onNotify('That file is too large to be a library', 'warn');
      return;
    }
    const title = file.name.replace(/\.[^.]*$/, '').trim() || 'Imported';
    const read = readLibraryFile(await file.text(), importShapeId, title);
    if (!read) {
      onNotify('That isn’t a library file', 'warn');
      return;
    }
    if (read.items.length === 0) {
      onNotify('Nothing in that library can be drawn here', 'warn');
      return;
    }
    setImporting(true);
    const result = await library.importItems(read.items);
    setImporting(false);
    show(PERSONAL);
    const total = read.items.length;
    if (result.error) {
      onNotify(`Imported ${result.imported} of ${total}. ${result.error}`, 'warn');
      return;
    }
    const notes = [
      result.tooLarge > 0 && `${result.tooLarge} too large`,
      read.imagesLeftOut > 0 && 'images left out',
    ].filter(Boolean);
    onNotify(
      `Imported ${plural(result.imported, 'item')}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`,
      notes.length > 0 ? 'warn' : undefined,
    );
  };

  const exportPersonal = async () => {
    try {
      const saved = await saveFile({
        boardName: 'Personal library',
        data: writeLibraryFile(library.items),
        format: 'library',
      });
      if (saved.status === 'saved') onNotify(`Exported ${plural(library.items.length, 'item')}`);
    } catch {
      onNotify('Couldn’t save the library file', 'warn');
    }
  };

  const addFromCatalogue = async (chosen: CatalogueLibrary) => {
    try {
      const added = await library.addFromCatalogue(chosen);
      onNotify(`Added ${chosen.name}`);
      show({ kind: 'added', id: added.id });
    } catch (err) {
      notifyFailure('Couldn’t add that library')(err);
    }
  };

  const filter = (entries: readonly LibraryEntry[]) => {
    const needle = query.trim().toLowerCase();
    return needle ? entries.filter((item) => item.name.toLowerCase().includes(needle)) : entries;
  };
  const noMatch = <PanelNote title={`Nothing called “${query.trim()}”`} />;
  const grid = (entries: readonly LibraryEntry[], actionsFor: (e: LibraryEntry) => TileActions) => {
    const shown = filter(entries);
    return shown.length === 0 ? (
      noMatch
    ) : (
      <TileGrid
        entries={shown}
        darkMode={darkMode}
        canPlace={canPlace}
        onPlace={onPlace}
        onDropped={onDropped}
        actionsFor={actionsFor}
        container={container}
      />
    );
  };
  const keepActions = (entry: LibraryEntry): TileActions =>
    library.enabled ? { keep: keep(entry) } : {};

  let body: ReactNode;
  let searchLabel = 'Search Personal';
  if (view.kind === 'browse') {
    searchLabel = 'Search the catalogue';
    body = (
      <LibraryBrowse
        query={query}
        added={library.added}
        canAdd={library.enabled}
        onAdd={addFromCatalogue}
        onOpen={(added) => show({ kind: 'added', id: added.id })}
      />
    );
  } else if (pack) {
    searchLabel = `Search ${pack.name}`;
    body = (
      <>
        <PaneHeader title={pack.name} detail={pack.description} />
        {grid(pack.items, keepActions)}
      </>
    );
  } else if (addedLibrary) {
    searchLabel = `Search ${addedLibrary.name}`;
    const state = catalogue.state;
    body = (
      <>
        <PaneHeader
          title={addedLibrary.name}
          detail={addedLibrary.credit ? `by ${addedLibrary.credit}` : null}
          action={
            <button
              type="button"
              className={cn(menuChipClasses, 'px-2')}
              onClick={() => {
                show(PERSONAL);
                library
                  .removeAdded(addedLibrary.id)
                  .catch(notifyFailure('Couldn’t remove that library'));
              }}
              data-testid="library-remove-added"
            >
              Remove
            </button>
          }
        />
        {state.status === 'loading' ? (
          <PanelNote title={`Opening ${addedLibrary.name}…`} />
        ) : state.status === 'error' ? (
          <PanelNote title={`Couldn’t open ${addedLibrary.name}`}>
            {state.error}
            <button
              type="button"
              className={cn(
                menuChipClasses,
                'mt-2 border border-neutral-300 dark:border-neutral-600',
              )}
              onClick={catalogue.retry}
            >
              Try again
            </button>
          </PanelNote>
        ) : state.value.entries.length === 0 ? (
          <PanelNote title="Nothing in this library can be drawn here" />
        ) : (
          <>
            {grid(state.value.entries, keepActions)}
            {state.value.imagesLeftOut > 0 && (
              <p className={cn('px-1 pt-2 text-[11px]', mutedText)}>
                Images in this library can’t be shown here yet.
              </p>
            )}
          </>
        )}
      </>
    );
  } else if (
    library.status === 'idle' ||
    (library.status === 'loading' && library.items.length === 0)
  ) {
    body = <PanelNote title="Opening your library…" />;
  } else if (library.status === 'error') {
    body = (
      <PanelNote title="Couldn’t open your library">
        {library.error}
        <button
          type="button"
          className={cn(menuChipClasses, 'mt-2 border border-neutral-300 dark:border-neutral-600')}
          onClick={library.load}
        >
          Try again
        </button>
      </PanelNote>
    );
  } else if (view.kind === 'recent') {
    searchLabel = 'Search Recently used';
    body =
      recentItems.length === 0 ? (
        <PanelNote title="Nothing placed yet">
          What you place from the library gathers here.
        </PanelNote>
      ) : (
        grid(recentItems, (entry) =>
          library.items.some((item) => item.id === entry.id)
            ? personalActions(entry)
            : keepActions(entry),
        )
      );
  } else if (library.items.length === 0) {
    body = (
      <PanelNote title="Nothing in your library yet">
        {canAdd
          ? 'Add the selection to start it.'
          : 'Select something on the board to add it here, or import a library file.'}
      </PanelNote>
    );
  } else {
    body = grid(library.items, personalActions);
  }

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col rounded-[inherit]',
        fileOver && 'outline-2 -outline-offset-2 outline-(--focus-highlight-color)',
      )}
      // A library file dropped anywhere on the panel is imported.
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files') || !library.enabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setFileOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileOver(false);
      }}
      onDrop={(event) => {
        const file = event.dataTransfer.files[0];
        setFileOver(false);
        if (!file || !library.enabled) return;
        event.preventDefault();
        void importFile(file);
      }}
    >
      <div className="flex flex-none items-center gap-1.5 p-2 pb-1.5">
        <label className={cn('flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2', wash)}>
          <Search aria-hidden="true" className={cn('size-4 shrink-0', mutedText)} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
            data-testid="library-search"
          />
        </label>
        <InlineDropdownMenu modal={false}>
          <InlineDropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Import and export"
              title="Import and export"
              disabled={!library.enabled || importing}
              className={cn(menuChipClasses, 'size-8 disabled:opacity-40')}
              data-testid="library-file-menu"
            >
              <Ellipsis aria-hidden="true" />
            </button>
          </InlineDropdownMenuTrigger>
          <InlineDropdownMenuContent container={container} align="end" sideOffset={4}>
            <InlineDropdownMenuItem
              icon={<Upload aria-hidden="true" />}
              onSelect={() => picker.current?.click()}
              data-testid="library-import"
            >
              Import library…
            </InlineDropdownMenuItem>
            <InlineDropdownMenuItem
              icon={<Download aria-hidden="true" />}
              disabled={library.items.length === 0}
              onSelect={() => void exportPersonal()}
              data-testid="library-export"
            >
              Export Personal
            </InlineDropdownMenuItem>
          </InlineDropdownMenuContent>
        </InlineDropdownMenu>
        <input
          ref={picker}
          type="file"
          accept={LIBRARY_FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }}
          data-testid="library-import-input"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-neutral-300 sm:flex-row dark:border-neutral-700">
        <nav
          aria-label="Libraries"
          className="flex flex-none gap-px overflow-x-auto border-b border-neutral-300 p-1.5 sm:w-46 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:border-r sm:border-b-0 dark:border-neutral-700"
        >
          <ShelfButton
            icon={<Folder />}
            label="Personal"
            count={library.status === 'ready' ? library.items.length : null}
            current={view.kind === 'personal'}
            onClick={() => show(PERSONAL)}
          />
          <ShelfButton
            icon={<Clock />}
            label="Recently used"
            count={library.status === 'ready' ? recentItems.length : null}
            current={view.kind === 'recent'}
            onClick={() => show({ kind: 'recent' })}
          />
          <ShelfLabel>Packs</ShelfLabel>
          {packs.map((p) => (
            <ShelfButton
              key={p.id}
              icon={<Package />}
              label={p.name}
              count={p.items.length}
              current={view.kind === 'pack' && view.id === p.id}
              onClick={() => show({ kind: 'pack', id: p.id })}
            />
          ))}
          {library.added.length > 0 && <ShelfLabel>Added</ShelfLabel>}
          {library.added.map((a: AddedLibrary) => (
            <ShelfButton
              key={a.id}
              icon={<BookOpen />}
              label={a.name}
              current={view.kind === 'added' && view.id === a.id}
              onClick={() => show({ kind: 'added', id: a.id })}
            />
          ))}
          <hr className="my-1 hidden h-px w-full flex-none border-0 bg-neutral-300 sm:block dark:bg-neutral-700" />
          <ShelfButton icon={<Users />} label="Workspace" soon />
          <span className="hidden flex-1 sm:block" />
          <ShelfButton
            icon={<Globe />}
            label="Browse libraries"
            current={view.kind === 'browse'}
            onClick={() => show({ kind: 'browse' })}
          />
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-1.5">{body}</div>
      </div>

      <div className="flex flex-none items-center gap-2 border-t border-neutral-300 p-1.5 dark:border-neutral-700">
        <button
          type="button"
          aria-pressed={pinned}
          aria-label="Keep open after placing"
          title="Keep open after placing"
          className={menuChipClasses}
          onClick={() => onPin(!pinned)}
          data-testid="library-pin"
        >
          <Pin aria-hidden="true" className={cn(pinned && 'fill-current')} />
        </button>
        <span className={cn('mr-auto truncate text-xs', mutedText)}>
          {importing
            ? 'Importing…'
            : !canPlace
              ? 'View only: you can’t place items on this board'
              : pinned
                ? 'Stays open after placing'
                : 'Closes after placing'}
        </span>
        <button
          type="button"
          disabled={!canAdd || !library.enabled || adding}
          title={
            canAdd ? 'Add the selection to Personal' : 'Select something on the board to add it'
          }
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-neutral-950 px-2.5 text-xs font-medium text-neutral-50 hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200 [&_svg]:size-3.5',
            focusRing,
          )}
          onClick={() => {
            setAdding(true);
            void onAdd().finally(() => setAdding(false));
          }}
          data-testid="library-add"
        >
          <Plus aria-hidden="true" />
          {adding ? 'Adding…' : 'Add selection'}
        </button>
      </div>
    </div>
  );
}

// Only for telling an imported item's shapes apart: every shape gets a fresh
// id again as it is placed.
let nextShapeId = 0;
const importShapeId = () => `import-${(nextShapeId += 1)}`;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function PaneHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-1 pb-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{title}</p>
        {detail && <p className={cn('truncate text-[11px]', mutedText)}>{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function ShelfLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className={cn(
        'hidden flex-none px-2 pt-2.5 pb-1 text-[11px] font-medium sm:block',
        mutedText,
      )}
    >
      {children}
    </p>
  );
}

function ShelfButton({
  icon,
  label,
  count = null,
  current = false,
  soon = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count?: number | null;
  current?: boolean;
  soon?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={soon}
      aria-current={current ? 'true' : undefined}
      onClick={onClick}
      title={label}
      className={cn(
        'flex h-7 flex-none items-center gap-2 rounded-md px-2 text-left text-xs whitespace-nowrap',
        focusRing,
        'hover:bg-neutral-950/10 dark:hover:bg-neutral-50/10',
        'disabled:pointer-events-none',
        current && 'bg-neutral-950/10 font-semibold dark:bg-neutral-50/10',
        soon && mutedText,
        '[&>svg]:size-3.75 [&>svg]:shrink-0',
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      {soon ? (
        <MenuBadge className="ml-auto">Soon</MenuBadge>
      ) : (
        count !== null && (
          <span className={cn('ml-auto font-normal tabular-nums', mutedText)}>{count}</span>
        )
      )}
    </button>
  );
}
