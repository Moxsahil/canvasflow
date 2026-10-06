import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Clock,
  Ellipsis,
  Folder,
  Globe,
  LibraryBig,
  Package,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  InlineDropdownMenu,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import {
  MenuBadge,
  menuChipClasses,
  menuDangerRowClasses,
  menuSurfaceClasses,
} from '@/components/ui/menu-look';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LIBRARY_DRAG_TYPE, LIBRARY_NAME_MAX, libraryThumbnail } from './library-items';
import { readLibraryPinned, storeLibraryPinned } from './library-storage';
import type { Library, LibraryEntry } from './useLibrary';

type Shelf = 'personal' | 'recent';

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
  /** Rename or delete went wrong: say so. */
  onError: (message: string) => void;
  /** The editor root, which the panel portals into for its theme. */
  container: HTMLElement | null;
}

const mutedText = 'text-neutral-500 dark:text-neutral-400';
const wash = 'bg-neutral-950/5 dark:bg-neutral-50/5';
const washOnHover = 'hover:bg-neutral-950/10 dark:hover:bg-neutral-50/10';
const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-highlight-color)';

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
  onError,
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
          'flex h-[min(360px,calc(100dvh-80px))] w-[min(580px,calc(100vw-16px))] flex-col p-0 shadow-none data-[state=open]:animate-none',
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
          onError={onError}
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
  onError: (message: string) => void;
  container: HTMLElement | null;
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
  onError,
  container,
}: LibraryPanelProps) {
  const [shelf, setShelf] = useState<Shelf>('personal');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const recentItems = useMemo(() => {
    const byId = new Map(library.items.map((item) => [item.id, item]));
    return library.recent.flatMap((id) => byId.get(id) ?? []);
  }, [library.items, library.recent]);

  const pool = shelf === 'recent' ? recentItems : library.items;
  const needle = query.trim().toLowerCase();
  const shown = needle ? pool.filter((item) => item.name.toLowerCase().includes(needle)) : pool;

  let body: ReactNode;
  if (library.status === 'idle' || (library.status === 'loading' && library.items.length === 0)) {
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
  } else if (shelf === 'recent' && recentItems.length === 0) {
    body = (
      <PanelNote title="Nothing placed yet">
        What you place from the library gathers here.
      </PanelNote>
    );
  } else if (library.items.length === 0) {
    body = (
      <PanelNote title="Nothing in your library yet">
        {canAdd
          ? 'Add the selection to start it.'
          : 'Select something on the board to add it here.'}
      </PanelNote>
    );
  } else if (shown.length === 0) {
    body = <PanelNote title={`Nothing called “${query.trim()}”`} />;
  } else {
    body = (
      <ul className="grid grid-cols-3 gap-0.5 sm:grid-cols-4" aria-label="Library items">
        {shown.map((entry) => (
          <LibraryTile
            key={entry.id}
            entry={entry}
            darkMode={darkMode}
            canPlace={canPlace}
            onPlace={() => onPlace(entry)}
            onDropped={onDropped}
            onRename={(name) =>
              library.rename(entry.id, name).catch((err: unknown) => {
                onError(err instanceof Error ? err.message : 'Couldn’t rename that.');
              })
            }
            onDelete={() =>
              library.remove(entry.id).catch((err: unknown) => {
                onError(err instanceof Error ? err.message : 'Couldn’t delete that.');
              })
            }
            container={container}
          />
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="flex-none p-2 pb-1.5">
        <label className={cn('flex h-8 items-center gap-2 rounded-md px-2', wash)}>
          <Search aria-hidden="true" className={cn('size-4 shrink-0', mutedText)} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search libraries"
            aria-label="Search libraries"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
            data-testid="library-search"
          />
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-neutral-300 sm:flex-row dark:border-neutral-700">
        <nav
          aria-label="Libraries"
          className="flex flex-none gap-px overflow-x-auto border-b border-neutral-300 p-1.5 sm:w-46 sm:flex-col sm:overflow-x-visible sm:border-r sm:border-b-0 dark:border-neutral-700"
        >
          <ShelfButton
            icon={<Folder />}
            label="Personal"
            count={library.status === 'ready' ? library.items.length : null}
            current={shelf === 'personal'}
            onClick={() => setShelf('personal')}
          />
          <ShelfButton
            icon={<Clock />}
            label="Recently used"
            count={library.status === 'ready' ? recentItems.length : null}
            current={shelf === 'recent'}
            onClick={() => setShelf('recent')}
          />
          <hr className="my-1 hidden h-px w-full border-0 bg-neutral-300 sm:block dark:bg-neutral-700" />
          <ShelfButton icon={<Package />} label="Packs" soon />
          <ShelfButton icon={<Users />} label="Workspace" soon />
          <span className="hidden flex-1 sm:block" />
          <ShelfButton icon={<Globe />} label="Browse libraries" soon />
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
          {canPlace
            ? pinned
              ? 'Stays open after placing'
              : 'Closes after placing'
            : 'View only: you can’t place items on this board'}
        </span>
        <button
          type="button"
          disabled={!canAdd || !library.enabled || adding}
          title={canAdd ? undefined : 'Select something on the board to add it'}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-neutral-950 px-2.5 text-xs font-medium text-neutral-50 outline-none hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) disabled:pointer-events-none disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200 [&_svg]:size-3.5"
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
    </>
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
      className={cn(
        'flex h-7 flex-none items-center gap-2 rounded-md px-2 text-left text-xs whitespace-nowrap',
        focusRing,
        washOnHover,
        'disabled:pointer-events-none',
        current && 'bg-neutral-950/10 font-semibold dark:bg-neutral-50/10',
        soon && mutedText,
        '[&>svg]:size-3.75 [&>svg]:shrink-0',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
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

function PanelNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-1 px-6 text-center text-xs">
      <p className="font-semibold">{title}</p>
      {children && <div className={cn('flex flex-col items-center', mutedText)}>{children}</div>}
    </div>
  );
}

interface LibraryTileProps {
  entry: LibraryEntry;
  darkMode: boolean;
  canPlace: boolean;
  onPlace: () => void;
  onDropped: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  container: HTMLElement | null;
}

/**
 * One item: its picture, which places it when picked or dragged, its name, and
 * a menu to rename or delete it.
 *
 * The picture is a div standing as a button rather than a button, because a
 * button cannot be dragged in every browser.
 */
function LibraryTile({
  entry,
  darkMode,
  canPlace,
  onPlace,
  onDropped,
  onRename,
  onDelete,
  container,
}: LibraryTileProps) {
  const thumbnail = useMemo(
    () => libraryThumbnail(entry.shapes, darkMode),
    [entry.shapes, darkMode],
  );
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <li
      className={cn(
        'group relative flex min-w-0 flex-col gap-1 rounded-lg p-1',
        'hover:bg-neutral-950/5 focus-within:bg-neutral-950/5 dark:hover:bg-neutral-50/5 dark:focus-within:bg-neutral-50/5',
      )}
      data-testid="library-tile"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={canPlace ? `Place ${entry.name}` : entry.name}
        aria-disabled={!canPlace || undefined}
        title={canPlace ? `${entry.name} — click to place, or drag onto the board` : entry.name}
        draggable={canPlace}
        onClick={() => {
          if (canPlace) onPlace();
        }}
        onKeyDown={(event) => {
          if (!canPlace || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          onPlace();
        }}
        onDragStart={(event) => {
          event.dataTransfer.setData(LIBRARY_DRAG_TYPE, entry.id);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onDragEnd={(event) => {
          if (event.dataTransfer.dropEffect !== 'none') onDropped();
        }}
        className={cn(
          'grid aspect-square w-full place-items-center overflow-hidden rounded-md',
          wash,
          focusRing,
          canPlace ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        )}
      >
        {thumbnail && (
          <img
            src={thumbnail}
            alt=""
            draggable={false}
            className="pointer-events-none size-full object-contain p-2"
          />
        )}
      </div>

      {renaming ? (
        <RenameField
          name={entry.name}
          onDone={(name) => {
            setRenaming(false);
            if (name !== null) onRename(name);
          }}
        />
      ) : (
        <span className="truncate px-0.5 text-[11px] leading-5.5" title={entry.name}>
          {entry.name}
        </span>
      )}

      <InlineDropdownMenu
        modal={false}
        onOpenChange={(next) => {
          if (!next) setConfirmingDelete(false);
        }}
      >
        <InlineDropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${entry.name}`}
            className={cn(
              'absolute top-1.5 right-1.5 hidden size-5.5 place-items-center rounded-md',
              menuSurfaceClasses,
              focusRing,
              // Always there on a touch screen, which has no hover to bring it up.
              'group-hover:grid group-focus-within:grid aria-expanded:grid pointer-coarse:grid [&_svg]:size-3.5',
            )}
            data-testid="library-tile-options"
          >
            <Ellipsis aria-hidden="true" />
          </button>
        </InlineDropdownMenuTrigger>
        <InlineDropdownMenuContent
          container={container}
          align="end"
          sideOffset={4}
          className="min-w-40"
        >
          <InlineDropdownMenuItem
            icon={<Pencil aria-hidden="true" />}
            onSelect={() => setRenaming(true)}
          >
            Rename
          </InlineDropdownMenuItem>
          <InlineDropdownMenuSeparator />
          <InlineDropdownMenuItem
            icon={<Trash2 aria-hidden="true" />}
            className={menuDangerRowClasses}
            // Asked twice, in place: an item deleted cannot be brought back.
            onSelect={(event) => {
              if (!confirmingDelete) {
                event.preventDefault();
                setConfirmingDelete(true);
                return;
              }
              onDelete();
            }}
            data-testid="library-tile-delete"
          >
            {confirmingDelete ? 'Click again to delete' : 'Delete'}
          </InlineDropdownMenuItem>
        </InlineDropdownMenuContent>
      </InlineDropdownMenu>
    </li>
  );
}

/** The name, typed over in place. Enter or leaving keeps it; Escape does not. */
function RenameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(name);
  const done = useRef(false);
  const finish = (result: string | null) => {
    if (done.current) return;
    done.current = true;
    const trimmed = result?.trim().replace(/\s+/g, ' ') ?? null;
    onDone(trimmed && trimmed !== name ? trimmed : null);
  };

  return (
    <input
      autoFocus
      value={value}
      maxLength={LIBRARY_NAME_MAX}
      aria-label="Name"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(value);
        // Leaves the name as it was. The panel stays open: it lets an Escape
        // from in here go by, see `data-library-rename`.
        if (event.key === 'Escape') finish(null);
      }}
      data-library-rename=""
      className="h-5.5 w-full min-w-0 rounded-[5px] bg-neutral-50 px-1 text-[11px] shadow-[inset_0_0_0_1.5px_var(--focus-highlight-color)] outline-none dark:bg-neutral-800"
      data-testid="library-rename"
    />
  );
}
