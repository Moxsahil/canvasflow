import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { Icon, type PhoneIconName } from '../settings/phone/icons';
import type { SurfaceTheme } from '../ui/surface-palette';
import { openedCatalogueEntry, type CatalogueLibrary } from './library-catalogue';
import { LIBRARY_FILE_ACCEPT } from './library-files';
import { libraryThumbnail } from './library-items';
import { LIBRARY_PACKS, localizePack } from './library-packs';
import { LibraryBrowse } from './LibraryBrowse';
import { useCatalogueItems } from './useCatalogue';
import type { Library, LibraryEntry } from './useLibrary';
import { useLibraryFiles, type Notify } from './useLibraryFiles';
import '../settings/phone/phone-settings.css';

/** How far a drag on the grip has to pull the sheet down before letting go closes it. */
const DISMISS_DRAG = 110;
/** How long a tile is held before it starts a pick of several. */
const HOLD_MS = 450;
/** How far a finger may wander while holding before it counts as a scroll. */
const HOLD_SLOP = 8;
/** The first few of a section shown on All; See all opens the rest. */
const MINE_ON_ALL = 3;
const PACK_ON_ALL = 6;

const PACK_ICONS: Record<string, PhoneIconName> = {
  flowchart: 'diamond',
  wireframe: 'phone',
  notes: 'note',
};

type Shelf =
  | { readonly kind: 'all' }
  | { readonly kind: 'mine' }
  | { readonly kind: 'pack'; readonly id: string }
  | { readonly kind: 'added'; readonly id: string }
  | { readonly kind: 'browse' };

const ALL: Shelf = { kind: 'all' };
const sameShelf = (a: Shelf, b: Shelf) =>
  a.kind === b.kind && ('id' in a ? a.id : '') === ('id' in b ? b.id : '');

interface PhoneLibrarySheetProps {
  library: Library;
  theme: SurfaceTheme;
  /** How many shapes are selected on the board, that Add selected would keep. */
  selectedCount: number;
  /** False for a viewer, who can keep things from a board but not put them on it. */
  canPlace: boolean;
  /** Keep what is selected. Says how it went itself. */
  onAdd: () => Promise<void>;
  /** Put these on the board together, in the middle of the view. */
  onPlace: (entries: readonly LibraryEntry[]) => void;
  onNotify: Notify;
  onClose: () => void;
  container: HTMLElement | null;
}

/**
 * The library on a phone: a tall sheet opened from the drawer, in the look of
 * the phone's Settings. Everything in it at once on All — what was placed
 * lately, one's own items, then each pack — with a chip for each shelf.
 *
 * A tap puts an item in the middle of the view and closes the sheet; holding
 * one starts picking several, to place together or, one's own, to remove.
 */
export function PhoneLibrarySheet({
  library,
  theme,
  selectedCount,
  canPlace,
  onAdd,
  onPlace,
  onNotify,
  onClose,
  container,
}: PhoneLibrarySheetProps) {
  const t = useT();
  const packs = useMemo(() => LIBRARY_PACKS.map((p) => localizePack(p, t)), [t]);
  const [shelf, setShelf] = useState<Shelf>(ALL);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);

  const show = (next: Shelf) => {
    setShelf(next);
    setQuery('');
    setMenu(false);
    body.current?.scrollTo({ top: 0 });
  };
  const files = useLibraryFiles(library, onNotify, () => show({ kind: 'mine' }));

  // Read afresh each time it opens, as the desktop's panel is.
  const { load } = library;
  useEffect(() => load(), [load]);

  const addedLibrary =
    shelf.kind === 'added' ? library.added.find((a) => a.id === shelf.id) : undefined;
  const catalogue = useCatalogueItems(addedLibrary ?? null);
  const addedEntries = useMemo(
    () => (addedLibrary && catalogue.state.status === 'ready' ? catalogue.state.value.entries : []),
    [addedLibrary, catalogue.state],
  );

  // Every item that can be on show, by id: for Recently used, and for placing
  // what was picked across shelves.
  const known = useMemo(() => {
    const map = new Map<string, LibraryEntry>();
    for (const item of library.items) map.set(item.id, item);
    for (const p of packs) for (const item of p.items) map.set(item.id, item);
    for (const item of addedEntries) map.set(item.id, item);
    return map;
  }, [library.items, packs, addedEntries]);
  const recent = useMemo(
    () => library.recent.flatMap((id) => known.get(id) ?? openedCatalogueEntry(id) ?? []),
    [library.recent, known],
  );
  const mine = library.items;
  const mineIds = useMemo(() => new Set(mine.map((item) => item.id)), [mine]);

  const needle = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!needle) return [];
    const named = (name: string) => name.toLowerCase().includes(needle);
    const minesHit = named(t('ps.lib.mine'));
    return [
      ...mine.filter((item) => minesHit || named(item.name)),
      ...packs.flatMap((p) => (named(p.name) ? p.items : p.items.filter((i) => named(i.name)))),
      ...addedEntries.filter((item) => named(item.name)),
    ];
  }, [needle, mine, packs, addedEntries, t]);

  const pack = shelf.kind === 'pack' ? packs.find((p) => p.id === shelf.id) : undefined;
  // What All picks out: whatever this shelf, or this search, has on show.
  const visible: readonly LibraryEntry[] = needle
    ? hits
    : shelf.kind === 'all'
      ? [...mine, ...packs.flatMap((p) => p.items)]
      : shelf.kind === 'mine'
        ? mine
        : pack
          ? pack.items
          : addedEntries;

  const stopPicking = () => {
    setSelecting(false);
    setPicked([]);
  };
  const close = () => {
    stopPicking();
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (menu) setMenu(false);
      else if (selecting) stopPicking();
      else if (shelf.kind === 'browse') show(ALL);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- holding a tile -------------------------------------------------------

  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  // A hold that picked a tile, and the moment the finger came up from it: the
  // tap that lift may make is not a tap on the tile as well. A long press
  // does not always end in a click, so this goes stale rather than waiting.
  const held = useRef(false);
  const heldUntil = useRef(0);
  const endHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  };
  const tileHandlers = (entry: LibraryEntry) => ({
    onPointerDown: (event: React.PointerEvent) => {
      if (selecting) return;
      endHold();
      hold.current = {
        x: event.clientX,
        y: event.clientY,
        timer: window.setTimeout(() => {
          hold.current = null;
          held.current = true;
          // Wherever the finger comes up: the tiles move as picking starts.
          const lifted = () => {
            held.current = false;
            heldUntil.current = performance.now() + 350;
          };
          window.addEventListener('pointerup', lifted, { once: true });
          window.addEventListener('pointercancel', lifted, { once: true });
          setMenu(false);
          setSelecting(true);
          setPicked([entry.id]);
          try {
            navigator.vibrate?.(10);
          } catch {
            // No buzz; the tile's tick says it as well.
          }
        }, HOLD_MS),
      };
    },
    onPointerMove: (event: React.PointerEvent) => {
      const at = hold.current;
      if (at && Math.hypot(event.clientX - at.x, event.clientY - at.y) > HOLD_SLOP) endHold();
    },
    onPointerUp: endHold,
    onPointerCancel: endHold,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onClick: () => {
      // The lift that ends a hold is not a tap as well.
      if (held.current || performance.now() < heldUntil.current) return;
      if (selecting) {
        setPicked((was) =>
          was.includes(entry.id) ? was.filter((id) => id !== entry.id) : [...was, entry.id],
        );
        return;
      }
      if (!canPlace) return;
      close();
      onPlace([entry]);
    },
  });

  // --- what the sheet holds -------------------------------------------------

  const tile = (entry: LibraryEntry) => (
    <PhoneTile
      key={entry.id}
      entry={entry}
      dark={theme === 'dark'}
      selecting={selecting}
      on={picked.includes(entry.id)}
      label={
        selecting ? entry.name : canPlace ? t('library.place', { name: entry.name }) : entry.name
      }
      {...tileHandlers(entry)}
    />
  );
  const grid = (entries: readonly LibraryEntry[]) => (
    <div className="lib-grid2" role="group" aria-label={t('library.items')}>
      {entries.map(tile)}
    </div>
  );
  const section = (title: string, count: number | null, see?: Shelf, action?: ReactNode) => (
    <div className="lib-sec">
      <b>
        {title}
        {count !== null && <small>{count}</small>}
      </b>
      {action ??
        (see && (
          <button type="button" onClick={() => show(see)}>
            {t('ps.lib.seeAll')}
          </button>
        ))}
    </div>
  );
  const empty = (icon: PhoneIconName, title: string, text: ReactNode, action?: ReactNode) => (
    <div className="lib-empty">
      <div className="art">
        <Icon name={icon} size={34} />
      </div>
      <b>{title}</b>
      <span>{text}</span>
      {action}
    </div>
  );

  const addSelection = () => {
    setMenu(false);
    setAdding(true);
    void onAdd().finally(() => {
      setAdding(false);
      show({ kind: 'mine' });
    });
  };
  const addButton =
    selectedCount > 0 ? (
      <button type="button" className="st-btn" onClick={addSelection} disabled={adding}>
        <Icon name="plus" size={17} />
        {t('ps.lib.addSelected', { count: selectedCount })}
      </button>
    ) : null;

  const loadingMine = library.status === 'idle' || (library.status === 'loading' && !mine.length);
  const mineNote =
    library.status === 'error' ? (
      <div className="lib-note">
        {library.error ?? t('library.openYoursFailed')}{' '}
        <button type="button" onClick={library.load}>
          {t('common.tryAgain')}
        </button>
      </div>
    ) : loadingMine ? (
      <div className="lib-note">{t('library.openingYours')}</div>
    ) : null;

  let content: ReactNode;
  if (shelf.kind === 'browse') {
    content = (
      <div className="lib-browse">
        <LibraryBrowse
          query={query}
          added={library.added}
          canAdd={library.enabled}
          onAdd={async (chosen: CatalogueLibrary) => {
            try {
              const added = await library.addFromCatalogue(chosen);
              onNotify(t('library.added', { name: chosen.name }));
              show({ kind: 'added', id: added.id });
            } catch (err) {
              onNotify(err instanceof Error ? err.message : t('library.addLibraryFailed'), 'warn');
            }
          }}
          onOpen={(added) => show({ kind: 'added', id: added.id })}
        />
      </div>
    );
  } else if (needle) {
    content =
      hits.length === 0 ? (
        empty(
          'search',
          t('ps.lib.noMatch', { query: query.trim() }),
          t('ps.lib.noMatchHint'),
          <button
            type="button"
            className="st-btn ghost"
            onClick={() => setShelf({ kind: 'browse' })}
          >
            <Icon name="globe" size={17} />
            {t('ps.lib.searchCommunity')}
          </button>,
        )
      ) : (
        <>
          <div className="lib-count">{t('ps.lib.results', { count: hits.length })}</div>
          {grid(hits)}
        </>
      );
  } else if (shelf.kind === 'mine') {
    content =
      mineNote ??
      (mine.length === 0 ? (
        empty('library', t('ps.lib.emptyMine'), t('ps.lib.emptyMineHint'), addButton)
      ) : (
        <>
          <div className="lib-count">{t('ps.lib.saved', { count: mine.length })}</div>
          {grid(mine)}
        </>
      ));
  } else if (pack) {
    content = (
      <>
        <div className="lib-count">{t('library.itemCount', { count: pack.items.length })}</div>
        {grid(pack.items)}
      </>
    );
  } else if (addedLibrary) {
    const state = catalogue.state;
    content = (
      <>
        {section(
          addedLibrary.name,
          state.status === 'ready' ? state.value.entries.length : null,
          undefined,
          <button
            type="button"
            onClick={() => {
              show(ALL);
              library
                .removeAdded(addedLibrary.id)
                .catch((err: unknown) =>
                  onNotify(err instanceof Error ? err.message : t('library.removeFailed'), 'warn'),
                );
            }}
          >
            {t('library.remove')}
          </button>,
        )}
        {addedLibrary.credit && (
          <div className="lib-count">{t('library.by', { credit: addedLibrary.credit })}</div>
        )}
        {state.status === 'loading' ? (
          <div className="lib-note">{t('library.opening', { name: addedLibrary.name })}</div>
        ) : state.status === 'error' ? (
          <div className="lib-note">
            {state.error}{' '}
            <button type="button" onClick={catalogue.retry}>
              {t('common.tryAgain')}
            </button>
          </div>
        ) : state.value.entries.length === 0 ? (
          <div className="lib-note">{t('library.nothingDrawableHere')}</div>
        ) : (
          grid(state.value.entries)
        )}
      </>
    );
  } else {
    content = (
      <>
        {recent.length > 0 && (
          <>
            {section(
              t('library.recent'),
              null,
              undefined,
              selecting ? undefined : (
                <button type="button" onClick={library.clearRecent}>
                  {t('ps.lib.clear')}
                </button>
              ),
            )}
            <div className="lib-recent">{recent.map(tile)}</div>
          </>
        )}
        {section(
          t('ps.lib.mine'),
          loadingMine ? null : mine.length,
          mine.length > MINE_ON_ALL ? { kind: 'mine' } : undefined,
        )}
        {mineNote}
        {mine.length > 0 && grid(mine.slice(0, MINE_ON_ALL))}
        {!selecting && library.enabled && (
          <button
            type="button"
            className="lib-save"
            style={{ marginTop: mine.length ? 12 : 0 }}
            disabled={adding}
            onClick={() => {
              if (selectedCount > 0) {
                addSelection();
                return;
              }
              close();
              onNotify(t('ps.lib.saveOwnHint'));
            }}
          >
            <span className="ico">
              <Icon name="plus" size={20} />
            </span>
            <span>
              {selectedCount > 0 ? (
                <>
                  <b>{t('ps.lib.saveSelected', { count: selectedCount })}</b>
                  {t('ps.lib.saveSelectedHint')}
                </>
              ) : (
                <>
                  <b>{t('ps.lib.saveOwn')}</b>
                  {t('ps.lib.saveOwnHint')}
                </>
              )}
            </span>
          </button>
        )}
        {packs.map((p) => (
          <div key={p.id}>
            {section(p.name, p.items.length, { kind: 'pack', id: p.id })}
            {grid(p.items.slice(0, PACK_ON_ALL))}
          </div>
        ))}
      </>
    );
  }

  const chips: { shelf: Shelf; label: string; icon: PhoneIconName }[] = [
    { shelf: ALL, label: t('ps.lib.all'), icon: 'grid' },
    { shelf: { kind: 'mine' }, label: t('ps.lib.mine'), icon: 'library' },
    ...packs.map((p) => ({
      shelf: { kind: 'pack', id: p.id } as Shelf,
      label: p.name,
      icon: PACK_ICONS[p.id] ?? 'layers',
    })),
    ...library.added.map((a) => ({
      shelf: { kind: 'added', id: a.id } as Shelf,
      label: a.name,
      icon: 'layers' as const,
    })),
  ];

  const pickedMine = picked.filter((id) => mineIds.has(id));
  const allPicked = visible.length > 0 && visible.every((entry) => picked.includes(entry.id));
  const hint = selecting
    ? t('ps.lib.hintPicking')
    : !canPlace
      ? t('library.viewOnly')
      : files.importing
        ? t('library.importing')
        : t('ps.lib.hint');

  const endDrag = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag > DISMISS_DRAG) close();
    else setDrag(0);
  };

  return createPortal(
    <>
      <div className="cf-ps-scrim" onClick={close} aria-hidden="true" />
      <section
        className={cn('cf-ps lib', theme === 'light' && 'light', drag ? 'dragging' : 'settle')}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('library.title')}
        data-testid="phone-library"
      >
        <div
          className="st-top"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            setDrag(Math.max(0, event.clientY - dragStart.current));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="grab" />
          <div className="st-bar">
            {selecting ? (
              <>
                <button type="button" className="lib-txt" onClick={stopPicking}>
                  {t('common.cancel')}
                </button>
                <span className="st-bar-t on">
                  {picked.length
                    ? t('ps.lib.selected', { count: picked.length })
                    : t('ps.lib.selectItems')}
                </span>
                <button
                  type="button"
                  className="lib-txt r"
                  onClick={() => setPicked(allPicked ? [] : visible.map((entry) => entry.id))}
                >
                  {allPicked ? t('ps.lib.none') : t('ps.lib.all')}
                </button>
              </>
            ) : (
              <>
                {shelf.kind === 'browse' ? (
                  <button
                    type="button"
                    className="st-ib"
                    onClick={() => show(ALL)}
                    aria-label={t('common.back')}
                  >
                    <Icon name="chevleft" size={19} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="st-ib"
                    onClick={close}
                    aria-label={t('common.close')}
                    data-testid="phone-library-close"
                  >
                    <Icon name="x" size={16} />
                  </button>
                )}
                <span className="st-bar-t on">
                  {shelf.kind === 'browse' ? t('library.browse') : t('library.title')}
                </span>
                {library.enabled ? (
                  <button
                    type="button"
                    className="st-ib r"
                    onClick={() => setMenu((was) => !was)}
                    aria-label={t('ps.lib.addTo')}
                    aria-expanded={menu}
                    disabled={files.importing}
                    data-testid="phone-library-plus"
                  >
                    <Icon name="plus" size={18} />
                  </button>
                ) : (
                  <span />
                )}
              </>
            )}
          </div>
        </div>

        <div className="lib-head">
          <label className="st-search">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                shelf.kind === 'browse' ? t('library.searchCatalogue') : t('ps.lib.search')
              }
              aria-label={
                shelf.kind === 'browse' ? t('library.searchCatalogue') : t('ps.lib.search')
              }
              autoComplete="off"
              data-testid="phone-library-search"
            />
          </label>
        </div>
        {shelf.kind !== 'browse' && (
          <>
            <div className="lib-chips" role="tablist" aria-label={t('ps.lib.categories')}>
              {chips.map((chip) => {
                const on = !needle && sameShelf(chip.shelf, shelf);
                return (
                  <button
                    key={`${chip.shelf.kind}-${'id' in chip.shelf ? chip.shelf.id : ''}`}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    className={cn('lib-chip', on && 'on')}
                    onClick={() => show(chip.shelf)}
                  >
                    <Icon name={chip.icon} size={16} />
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <div className="lib-head">
              <div className="lib-hint">{hint}</div>
            </div>
          </>
        )}

        <div ref={body} className="st-body" style={{ paddingTop: 4 }}>
          {content}
        </div>

        {selecting && (
          <div className="st-cta">
            <div className={cn('lib-cta', pickedMine.length === 0 && 'one')}>
              <button
                type="button"
                className="st-btn"
                disabled={picked.length === 0 || !canPlace}
                onClick={() => {
                  const entries = picked.flatMap(
                    (id) => known.get(id) ?? openedCatalogueEntry(id) ?? [],
                  );
                  close();
                  if (entries.length) onPlace(entries);
                }}
                data-testid="phone-library-place"
              >
                <Icon name="plus" size={17} />
                {picked.length
                  ? t('ps.lib.placeCount', { count: picked.length })
                  : t('ps.lib.placeOnBoard')}
              </button>
              {pickedMine.length > 0 && (
                <button
                  type="button"
                  className="st-btn ghost"
                  onClick={() => {
                    const gone = pickedMine.length;
                    for (const id of pickedMine) {
                      library
                        .remove(id)
                        .catch((err: unknown) =>
                          onNotify(
                            err instanceof Error ? err.message : t('library.deleteFailed'),
                            'warn',
                          ),
                        );
                    }
                    const left = picked.filter((id) => !mineIds.has(id));
                    setPicked(left);
                    if (left.length === 0) setSelecting(false);
                    onNotify(t('ps.lib.removed', { count: gone }));
                  }}
                  data-testid="phone-library-remove"
                >
                  <Icon name="trash" size={17} />
                  {t('library.remove')}
                </button>
              )}
            </div>
          </div>
        )}

        {menu && (
          <>
            <div className="lib-menu-scrim" onClick={() => setMenu(false)} aria-hidden="true" />
            <div className="lib-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={selectedCount === 0 || adding}
                onClick={addSelection}
              >
                <Icon name="selectall" size={19} />
                <span>
                  {t('ps.lib.addSelection')}
                  <small>
                    {selectedCount > 0
                      ? t('ps.lib.shapesOnBoard', { count: selectedCount })
                      : t('ps.lib.selectFirst')}
                  </small>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  picker.current?.click();
                }}
              >
                <Icon name="folder" size={19} />
                <span>
                  {t('ps.lib.importFile')}
                  <small>{t('ps.lib.importHint')}</small>
                </span>
              </button>
              <hr />
              <button type="button" role="menuitem" onClick={() => show({ kind: 'browse' })}>
                <Icon name="globe" size={19} />
                <span>
                  {t('ps.lib.browse')}
                  <small>{t('ps.lib.browseHint')}</small>
                </span>
              </button>
            </div>
          </>
        )}
        <input
          ref={picker}
          type="file"
          accept={LIBRARY_FILE_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void files.importFile(file);
          }}
          data-testid="phone-library-import-input"
        />
      </section>
    </>,
    container ?? document.querySelector<HTMLElement>('.cf-editor') ?? document.body,
  );
}

/** One item: its picture and its name, with a tick while picking several. */
function PhoneTile({
  entry,
  dark,
  selecting,
  on,
  label,
  ...handlers
}: {
  entry: LibraryEntry;
  dark: boolean;
  selecting: boolean;
  on: boolean;
  label: string;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const thumbnail = useMemo(() => libraryThumbnail(entry.shapes, dark), [entry.shapes, dark]);
  return (
    <button
      type="button"
      className={cn('lt', on && 'on')}
      aria-label={label}
      aria-pressed={selecting ? on : undefined}
      data-testid="phone-library-tile"
      {...handlers}
    >
      <span className="lt-p">{thumbnail && <img src={thumbnail} alt="" draggable={false} />}</span>
      {selecting && (
        <span className="ck">
          <Icon name="check" size={13} />
        </span>
      )}
      <span className="n">{entry.name}</span>
    </button>
  );
}
