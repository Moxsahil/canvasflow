import { useMemo, useRef, useState } from 'react';
import { BookPlus, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  InlineDropdownMenu,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import { menuDangerRowClasses, menuSurfaceClasses } from '@/components/ui/menu-look';
import { endLibraryDrag, startLibraryDrag } from './library-drag';
import { LIBRARY_DRAG_TYPE, LIBRARY_NAME_MAX, libraryThumbnail } from './library-items';
import type { LibraryEntry } from './useLibrary';

export const wash = 'bg-neutral-950/5 dark:bg-neutral-50/5';
export const mutedText = 'text-neutral-500 dark:text-neutral-400';
export const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-highlight-color)';

/** What a tile's menu offers. Only the ones given are shown; with none, there is no menu. */
export interface TileActions {
  /** Keep a copy in Personal: for items of a library that is not yours to change. */
  keep?: () => void;
  rename?: (name: string) => void;
  remove?: () => void;
}

interface TileGridProps {
  entries: readonly LibraryEntry[];
  darkMode: boolean;
  canPlace: boolean;
  onPlace: (entry: LibraryEntry) => void;
  /** A tile was dragged onto the board and let go there. */
  onDropped: () => void;
  actionsFor: (entry: LibraryEntry) => TileActions;
  container: HTMLElement | null;
}

export function TileGrid({
  entries,
  darkMode,
  canPlace,
  onPlace,
  onDropped,
  actionsFor,
  container,
}: TileGridProps) {
  return (
    <ul className="grid grid-cols-3 gap-0.5 sm:grid-cols-4" aria-label="Library items">
      {entries.map((entry) => (
        <LibraryTile
          key={entry.id}
          entry={entry}
          darkMode={darkMode}
          canPlace={canPlace}
          onPlace={() => onPlace(entry)}
          onDropped={onDropped}
          actions={actionsFor(entry)}
          container={container}
        />
      ))}
    </ul>
  );
}

interface LibraryTileProps {
  entry: LibraryEntry;
  darkMode: boolean;
  canPlace: boolean;
  onPlace: () => void;
  onDropped: () => void;
  actions: TileActions;
  container: HTMLElement | null;
}

/**
 * One item: its picture, which places it when picked or dragged, its name, and
 * a menu of what can be done with it.
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
  actions,
  container,
}: LibraryTileProps) {
  const thumbnail = useMemo(
    () => libraryThumbnail(entry.shapes, darkMode),
    [entry.shapes, darkMode],
  );
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { keep, rename, remove } = actions;
  const hasMenu = Boolean(keep || rename || remove);

  return (
    <li
      className={cn(
        'group relative flex min-w-0 flex-col gap-1 rounded-lg p-1',
        'focus-within:bg-neutral-950/5 hover:bg-neutral-950/5 dark:focus-within:bg-neutral-50/5 dark:hover:bg-neutral-50/5',
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
          startLibraryDrag(entry);
          event.dataTransfer.setData(LIBRARY_DRAG_TYPE, entry.id);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onDragEnd={(event) => {
          endLibraryDrag();
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

      {renaming && rename ? (
        <RenameField
          name={entry.name}
          onDone={(name) => {
            setRenaming(false);
            if (name !== null) rename(name);
          }}
        />
      ) : (
        <span className="truncate px-0.5 text-[11px] leading-5.5" title={entry.name}>
          {entry.name}
        </span>
      )}

      {hasMenu && (
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
                'group-focus-within:grid group-hover:grid aria-expanded:grid pointer-coarse:grid [&_svg]:size-3.5',
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
            {keep && (
              <InlineDropdownMenuItem
                icon={<BookPlus aria-hidden="true" />}
                onSelect={keep}
                data-testid="library-tile-keep"
              >
                Add to Personal
              </InlineDropdownMenuItem>
            )}
            {rename && (
              <InlineDropdownMenuItem
                icon={<Pencil aria-hidden="true" />}
                onSelect={() => setRenaming(true)}
              >
                Rename
              </InlineDropdownMenuItem>
            )}
            {remove && (
              <>
                {(keep || rename) && <InlineDropdownMenuSeparator />}
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
                    remove();
                  }}
                  data-testid="library-tile-delete"
                >
                  {confirmingDelete ? 'Click again to delete' : 'Delete'}
                </InlineDropdownMenuItem>
              </>
            )}
          </InlineDropdownMenuContent>
        </InlineDropdownMenu>
      )}
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
