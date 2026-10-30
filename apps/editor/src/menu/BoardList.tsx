import { BoardGlide, glideRowClasses } from './BoardGlide';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { menuDangerRowClasses } from '@/components/ui/menu-look';
import {
  InlineDropdownMenu,
  InlineDropdownMenuChoiceItem,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuRadioGroup,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from '@/components/ui/sidebar';
import type { SurfaceTheme } from '../ui/surface-palette';
import { BOARD_COLORS } from '../workspace/board-colors';
import { useT } from '../i18n';
import { ColorDot } from '../workspace/board-presentation';
import { DeleteWarningDialog } from '../workspace/DeleteWarningDialog';
import { SHARED_WITH_YOU } from '../workspace';
import { pinnedOf } from '../workspace/useBoardSwitcher';
import { carryRename, isSecondPress, takeCarriedRename } from './double-press';
import type { BoardColor, BoardSummary, BoardSwitcherState } from '../workspace';
import type { SharedBoard } from '../workspace/people-api';
import type { BoardDetailsPatch } from '../workspace/workspace-api';

/** A small square button beside the group's label. */
const labelActionClasses =
  'grid size-6 shrink-0 place-items-center rounded-md text-sidebar-foreground/70 outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4';

const noteClasses = 'px-2 py-1.5 text-xs text-sidebar-foreground/60';

/** A short rule between the rail's runs of icons, as wide as an icon. Rail only. */
const railSeparatorClasses =
  'hidden h-px w-5 shrink-0 self-center bg-sidebar-border group-data-[collapsible=icon]:block';

/** The rule after the boards, before the board's own actions. */
export function RailSeparator() {
  return <div aria-hidden="true" className={railSeparatorClasses} />;
}

/**
 * The boards of the workspace the header names, each one click away.
 *
 * The workspace's boards used to sit two levels down the switcher, behind the
 * workspace they belong to. Switching boards is the thing people do most from
 * the sidebar, so the list is the sidebar's body now, with a field to find one
 * by name.
 *
 * Collapsed to the icon rail, each board keeps its colour tag as its icon and
 * its name as a tooltip, so the rail still switches boards. The field turns
 * into a button that opens the sidebar with the field ready to type in.
 *
 * A guest let in by share link has no workspace, and no list.
 */
export function BoardList({ state, portalContainer, theme }: BoardListProps) {
  const t = useT();
  const { state: sidebarState, isMobile, setOpen } = useSidebar();
  const collapsed = sidebarState === 'collapsed' && !isMobile;
  const [query, setQuery] = useState('');
  const [findRequested, setFindRequested] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The board a row's menu asked to delete, held here rather than in the row:
  // the row goes the moment the delete succeeds, and the dialog asking about it
  // has to outlive it long enough to close.
  const [pendingDelete, setPendingDelete] = useState<BoardSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The row being renamed in place, if any: one at a time.
  // Or the board a double press on it opened, which the sidebar it was
  // pressed in did not live to rename.
  const [renamingId, setRenamingId] = useState<string | null>(takeCarriedRename);
  // Archived boards wait folded away under one row until asked for.
  const [archivedOpen, setArchivedOpen] = useState(false);

  const askToDelete = useCallback((board: BoardSummary) => {
    setDeleteError(null);
    setPendingDelete(board);
  }, []);

  const { deleteBoard } = state;
  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    setDeleteError(null);
    // Deleting the open board also moves the editor to another one.
    deleteBoard(pendingDelete.id).then(
      () => setPendingDelete(null),
      (err: unknown) =>
        setDeleteError(err instanceof Error ? err.message : t('common.somethingWentWrong')),
    );
  }, [pendingDelete, deleteBoard, t]);

  // Focused once the sidebar has opened: the field is not on screen in the
  // rail, and a hidden input cannot take focus.
  useEffect(() => {
    if (!findRequested || collapsed) return;
    inputRef.current?.focus();
    setFindRequested(false);
  }, [findRequested, collapsed]);

  // An archived board that is open is shown where it now lives.
  useEffect(() => {
    if (state.archived) setArchivedOpen(true);
  }, [state.archived]);

  const workspaceId = state.listedId;
  if (!state.available || !workspaceId) return null;

  if (workspaceId === SHARED_WITH_YOU) {
    return <SharedList state={state} query={query} setQuery={setQuery} inputRef={inputRef} />;
  }

  const entry = state.boardsFor(workspaceId);
  const boards = entry?.status === 'ready' ? entry.boards : [];
  const needle = query.trim().toLowerCase();
  const matches = (board: BoardSummary) => !needle || board.title.toLowerCase().includes(needle);
  // Three runs out of one list: your pins, top first; the rest, most recently
  // changed first; and the archived, out of the way at the foot.
  const pinned = pinnedOf(boards).filter(matches);
  const listed = boards.filter((board) => !board.archivedAt && !board.pin && matches(board));
  const archived = boards.filter((board) => board.archivedAt && matches(board));
  const liveCount = boards.filter((board) => !board.archivedAt).length;
  const shownCount = pinned.length + listed.length + archived.length;
  // A search reaches into the archive too, and shows what it found there.
  const archiveShown = archivedOpen || (needle !== '' && archived.length > 0);

  const rowProps = (board: BoardSummary) => ({
    board,
    current: board.id === state.boardId,
    portalContainer,
    onOpen: () => state.openBoard(board.id),
    renaming: renamingId === board.id,
    onRename: () => setRenamingId(board.id),
    onRenameSave: (patch: BoardDetailsPatch) => state.renameBoard(board.id, patch),
    onRenameEnd: () => setRenamingId(null),
    onDelete: () => askToDelete(board),
    canManage: state.canManageBoard(board),
    onPin: () => state.pinBoard(board.id),
    onUnpin: () => state.unpinBoard(board.id),
    // The failure is said by the switcher, which also puts the row back.
    onArchive: () => void state.archiveBoard(board.id).catch(() => {}),
    onUnarchive: () => void state.unarchiveBoard(board.id).catch(() => {}),
  });

  return (
    // No padding under the list in the rail: the rule after it keeps the
    // same space on both sides as the rule after find does.
    <SidebarGroup className="group-data-[collapsible=icon]:pb-0">
      <SidebarGroupContent className="flex flex-col gap-1">
        <div className="relative mb-1 group-data-[collapsible=icon]:hidden">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-sidebar-foreground/50"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Clears the field first; only an empty field lets Escape reach
              // the board, where it cancels the tool as it always has.
              if (event.key === 'Escape' && query) {
                event.stopPropagation();
                setQuery('');
              }
            }}
            placeholder={t('boards.find')}
            aria-label={t('boards.find')}
            data-testid="sidebar-find-board"
            className="h-8 w-full rounded-md bg-sidebar-accent/60 pr-2 pl-8 text-sm text-sidebar-foreground outline-hidden ring-sidebar-ring placeholder:text-sidebar-foreground/50 focus-visible:ring-2 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>

        <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
          <RailOnly>
            <SidebarMenuButton
              tooltip={t('boards.find')}
              onClick={() => {
                setOpen(true);
                setFindRequested(true);
              }}
            >
              <Search aria-hidden="true" />
              <span>{t('boards.find')}</span>
            </SidebarMenuButton>
          </RailOnly>
          <li aria-hidden="true" className={cn(railSeparatorClasses, 'my-1')} />
        </SidebarMenu>

        {pinned.length > 0 && (
          <>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              {t('boards.pinned')}
            </SidebarGroupLabel>
            <PinnedList
              boards={pinned}
              // Dragged only in the full list: a search shows a part of it,
              // and the rail has no room to aim a drop.
              reorderable={!needle && !collapsed && renamingId === null}
              onReorder={state.reorderPins}
              rowProps={rowProps}
            />
            <div aria-hidden="true" className={cn(railSeparatorClasses, 'my-1')} />
          </>
        )}

        <div className="flex items-center gap-0.5 pr-1 group-data-[collapsible=icon]:hidden">
          {entry === undefined || entry.status === 'loading' ? (
            // Until the list answers this may turn out to be "Shared with you".
            <div className="flex h-8 flex-1 items-center px-2">
              <Skeleton className="h-[11px] w-20" />
            </div>
          ) : (
            <>
              <SidebarGroupLabel className="flex-1">{t('menu.yourBoards')}</SidebarGroupLabel>
              <button
                type="button"
                className={labelActionClasses}
                aria-label={t('boards.new')}
                title={t('boards.new')}
                data-testid="sidebar-new-board"
                disabled={state.busy}
                onClick={() => state.createBoard(workspaceId)}
              >
                <Plus aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        <SidebarMenu className="relative max-h-[min(40vh,22rem)] overflow-y-auto [scrollbar-width:thin] group-data-[collapsible=icon]:max-h-none group-data-[collapsible=icon]:[scrollbar-width:none]">
          <BoardGlide />
          {(entry === undefined || entry.status === 'loading') &&
            [0, 1, 2].map((key) => (
              <SidebarMenuItem key={key}>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            ))}

          {entry?.status === 'error' && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t('boards.loadFailed')}
                onClick={() => state.browseWorkspace(workspaceId)}
                className={menuDangerRowClasses}
              >
                <RotateCw aria-hidden="true" />
                <span>{t('boards.loadFailed')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {entry?.status === 'ready' && liveCount === 0 && !needle && (
            <li className={`${noteClasses} group-data-[collapsible=icon]:hidden`}>
              {t('boards.none')}
            </li>
          )}
          {entry?.status === 'ready' && boards.length > 0 && needle && shownCount === 0 && (
            <li className={`${noteClasses} group-data-[collapsible=icon]:hidden`}>
              {t('boards.noMatch')}
            </li>
          )}

          {listed.map((board) => (
            <BoardRow key={board.id} {...rowProps(board)} />
          ))}

          <RailOnly>
            <SidebarMenuButton
              tooltip={t('boards.new')}
              disabled={state.busy}
              onClick={() => state.createBoard(workspaceId)}
            >
              <Plus aria-hidden="true" />
              <span>{t('boards.new')}</span>
            </SidebarMenuButton>
          </RailOnly>

          {archived.length > 0 && (
            <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
              <SidebarMenuButton
                aria-expanded={archiveShown}
                onClick={() => setArchivedOpen(!archiveShown)}
                data-testid="sidebar-archived-toggle"
                className="text-sidebar-foreground/70"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn('transition-transform', archiveShown && 'rotate-90')}
                />
                <span className="flex-1">{t('boards.archived')}</span>
                <span className="text-xs text-sidebar-foreground/50 tabular-nums">
                  {archived.length}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {archiveShown &&
            archived.map((board) => (
              <BoardRow
                key={board.id}
                {...rowProps(board)}
                className="group-data-[collapsible=icon]:hidden"
              />
            ))}
        </SidebarMenu>
      </SidebarGroupContent>

      {/* The same warning Manage boards gives: the server decides who may
          delete, and a refusal is read here rather than lost with the menu. */}
      <DeleteWarningDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        theme={theme}
        busy={state.busy}
        error={deleteError}
        onConfirm={confirmDelete}
        title={t('boards.deleteTitle', { title: pendingDelete?.title ?? t('boards.thisBoard') })}
        confirmLabel={t('boards.deleteConfirm')}
        description={t('boards.deleteWarning')}
      />
    </SidebarGroup>
  );
}

/** How long a finger rests on a pin before it lifts to be dragged. */
const PIN_HOLD_MS = 350;
/** How far a mouse moves with its button down before that is a drag, not a click. */
const PIN_DRAG_SLOP = 4;
/** How far a finger may wander while resting, before it is a scroll instead. */
const PIN_HOLD_SLOP = 8;
/** How long a mouse button stays down on a pin before the hand closes on it. */
const PIN_GRAB_MS = 150;

/**
 * The closed hand, over the whole editor while a pin is held: the pointer
 * leaves the row as it drags, and every button it passes would otherwise put
 * its own cursor back. A quick click never shows it.
 */
function setGrabbing(on: boolean) {
  if (on) document.documentElement.setAttribute('data-pin-grabbing', '');
  else document.documentElement.removeAttribute('data-pin-grabbing');
}

interface PinDrag {
  id: string;
  from: number;
  to: number;
  /** How far the pointer has moved since the row was picked up. */
  dy: number;
  /** From one row's top to the next, measured as it was picked up. */
  pitch: number;
}

/**
 * Your pins, in the order you put them, and the way to change it: press a pin
 * and drag it up or down — with a mouse, as soon as it moves; with a finger,
 * after resting on it a moment, so a swipe still scrolls the list. Alt with
 * the up and down arrows moves the focused pin from the keyboard.
 *
 * The rows trade places as the pin passes their middles, and the one in hand
 * follows the pointer. Only the moved pin is written, between its new
 * neighbours, once it is let go.
 */
function PinnedList({
  boards,
  reorderable,
  onReorder,
  rowProps,
}: {
  boards: BoardSummary[];
  reorderable: boolean;
  onReorder: (orderedIds: readonly string[], movedId: string) => void;
  rowProps: (board: BoardSummary) => Omit<BoardRowProps, 'className'>;
}) {
  const t = useT();
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<PinDrag | null>(null);
  // A press is followed by a click; one that ended a drag must not open the board.
  const swallowClick = useRef(false);
  // Torn down when the press ends, however it ends.
  const endPress = useRef<(() => void) | null>(null);
  useEffect(() => () => endPress.current?.(), []);

  const ids = boards.map((board) => board.id);
  const byId = new Map(boards.map((board) => [board.id, board]));
  const order = drag ? moved(ids, drag.from, drag.to) : ids;

  const press = (event: ReactPointerEvent<HTMLLIElement>, id: string) => {
    if (!reorderable || event.button !== 0 || endPress.current) return;
    // The row's ⋯ menu is a button of its own.
    if ((event.target as Element).closest('[data-sidebar="menu-action"]')) return;
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-pin-row]');
    if (!rows || rows.length < 2) return;

    const from = ids.indexOf(id);
    const first = rows[0]!.getBoundingClientRect();
    const pitch = rows[1]!.getBoundingClientRect().top - first.top;
    const count = rows.length;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const byTouch = event.pointerType !== 'mouse';
    let lifted = false;
    let target = from;

    const lift = () => {
      lifted = true;
      if (byTouch) navigator.vibrate?.(10);
      else setGrabbing(true);
      setDrag({ id, from, to: from, dy: 0, pitch });
    };
    const hold = byTouch
      ? window.setTimeout(lift, PIN_HOLD_MS)
      : window.setTimeout(() => setGrabbing(true), PIN_GRAB_MS);

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!lifted) {
        if (byTouch) {
          // Moving before the hold is up is a scroll, not a drag.
          if (Math.hypot(dx, dy) > PIN_HOLD_SLOP) finish(false);
          return;
        }
        if (Math.abs(dy) < PIN_DRAG_SLOP) return;
        lift();
      }
      target = Math.max(0, Math.min(count - 1, Math.round(from + dy / pitch)));
      setDrag({ id, from, to: target, dy, pitch });
    };
    // Once a finger has lifted a pin, the page must not scroll under it.
    const holdStill = (touchEvent: TouchEvent) => {
      if (lifted) touchEvent.preventDefault();
    };
    const keys = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        keyEvent.stopPropagation();
        finish(false);
      }
    };
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === pointerId) finish(true);
    };
    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) finish(false);
    };

    const finish = (commit: boolean) => {
      window.clearTimeout(hold);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', holdStill);
      window.removeEventListener('keydown', keys, true);
      setGrabbing(false);
      endPress.current = null;
      if (!lifted) return;
      swallowClick.current = true;
      // Cleared after the click this press may still send has been swallowed.
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 0);
      setDrag(null);
      if (commit && target !== from) onReorder(moved(ids, from, target), id);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', holdStill, { passive: false });
    window.addEventListener('keydown', keys, true);
    endPress.current = () => finish(false);
  };

  const nudge = (event: ReactKeyboardEvent<HTMLLIElement>, id: string) => {
    if (!reorderable || !event.altKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const from = ids.indexOf(id);
    const to = event.key === 'ArrowUp' ? from - 1 : from + 1;
    if (to < 0 || to >= ids.length) return;
    onReorder(moved(ids, from, to), id);
  };

  return (
    <SidebarMenu
      ref={listRef}
      aria-label={t('boards.pinned')}
      data-testid="sidebar-pinned-boards"
      className="relative max-h-[min(30vh,16rem)] overflow-y-auto [scrollbar-width:thin] group-data-[collapsible=icon]:max-h-none group-data-[collapsible=icon]:[scrollbar-width:none]"
    >
      <BoardGlide />
      {order.map((id) => {
        const board = byId.get(id)!;
        const held = drag?.id === id;
        return (
          <BoardRow
            key={id}
            {...rowProps(board)}
            data-pin-row=""
            title={reorderable ? t('boards.dragToReorder') : undefined}
            aria-keyshortcuts={reorderable ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
            onPointerDown={(event) => press(event, id)}
            onKeyDown={(event) => nudge(event, id)}
            onClickCapture={(event) => {
              if (!swallowClick.current) return;
              event.preventDefault();
              event.stopPropagation();
            }}
            // A long press is the start of a drag here, not a call for the
            // browser's own menu or text selection.
            onContextMenu={(event) => {
              if (endPress.current) event.preventDefault();
            }}
            className={cn(
              'select-none [-webkit-touch-callout:none]',
              held && 'z-10 rounded-md bg-sidebar-accent shadow-lg',
            )}
            style={
              held && drag
                ? { transform: `translateY(${drag.dy - (drag.to - drag.from) * drag.pitch}px)` }
                : undefined
            }
          />
        );
      })}
    </SidebarMenu>
  );
}

/** `ids` with the one at `from` taken out and put back at `to`. */
function moved(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids];
  const [id] = next.splice(from, 1);
  next.splice(to, 0, id!);
  return next;
}

/**
 * The boards shared with one from workspaces one is not in, listed in a
 * workspace's place. Opening one is all there is to do from here: renaming,
 * deleting and making boards belong to the workspaces they live in.
 */
function SharedList({
  state,
  query,
  setQuery,
  inputRef,
}: {
  state: BoardSwitcherState;
  query: string;
  setQuery: (query: string) => void;
  inputRef: RefObject<HTMLInputElement>;
}) {
  const t = useT();
  const boards = state.sharedBoards;
  const needle = query.trim().toLowerCase();
  const shown = (boards ?? []).filter(
    (board) => !needle || board.title.toLowerCase().includes(needle),
  );

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:pb-0">
      <SidebarGroupContent className="flex flex-col gap-1">
        <div className="relative mb-1 group-data-[collapsible=icon]:hidden">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-sidebar-foreground/50"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.stopPropagation();
                setQuery('');
              }
            }}
            placeholder={t('boards.find')}
            aria-label={t('boards.find')}
            data-testid="sidebar-find-board"
            className="h-8 w-full rounded-md bg-sidebar-accent/60 pr-2 pl-8 text-sm text-sidebar-foreground outline-hidden ring-sidebar-ring placeholder:text-sidebar-foreground/50 focus-visible:ring-2 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>

        <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
          {t('boards.sharedWithYou')}
        </SidebarGroupLabel>

        <SidebarMenu
          data-testid="sidebar-shared-boards"
          className="relative max-h-[min(40vh,22rem)] overflow-y-auto [scrollbar-width:thin] group-data-[collapsible=icon]:max-h-none group-data-[collapsible=icon]:[scrollbar-width:none]"
        >
          <BoardGlide />
          {boards === null &&
            [0, 1].map((key) => (
              <SidebarMenuItem key={key}>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            ))}
          {boards?.length === 0 && (
            <li className={`${noteClasses} group-data-[collapsible=icon]:hidden`}>
              {t('boards.nothingShared')}
            </li>
          )}
          {boards && boards.length > 0 && shown.length === 0 && (
            <li className={`${noteClasses} group-data-[collapsible=icon]:hidden`}>
              {t('boards.noMatch')}
            </li>
          )}
          {shown.map((board) => (
            <SharedRow
              key={board.id}
              board={board}
              current={board.id === state.boardId}
              onOpen={() => state.openBoard(board.id)}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** A shared board: its tag, its name, and whose it is, in place of a menu. */
function SharedRow({
  board,
  current,
  onOpen,
}: {
  board: SharedBoard;
  current: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={current}
        aria-current={current ? 'page' : undefined}
        tooltip={t('boards.sharedTooltip', {
          title: board.title,
          owner: board.ownerName,
          workspace: board.workspaceName,
        })}
        onClick={onOpen}
        data-testid={`sidebar-shared-board-${board.id}`}
        className={cn('h-auto py-1.5', glideRowClasses)}
      >
        <span className="grid size-4 shrink-0 place-items-center self-start pt-1">
          <ColorDot color={board.color} />
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate">{board.title}</span>
          <span className="truncate text-xs text-sidebar-foreground/50">
            {`${board.ownerName} · ${board.role === 'viewer' ? t('access.canView') : t('access.canEdit')}`}
          </span>
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

interface BoardListProps {
  state: BoardSwitcherState;
  /** Where the row menus portal to — see InlineDropdownMenuContent's `container`. */
  portalContainer: HTMLElement | null;
  /** The theme on screen, which the delete warning paints its own surface for. */
  theme: SurfaceTheme;
}

/** Shown only in the collapsed rail, where the field and the label's buttons are not. */
function RailOnly({ children }: { children: ReactNode }) {
  return (
    <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
      {children}
    </SidebarMenuItem>
  );
}

interface BoardRowProps {
  board: BoardSummary;
  current: boolean;
  portalContainer: HTMLElement | null;
  onOpen: () => void;
  /** The row is a name field, from the menu's Rename. */
  renaming: boolean;
  onRename: () => void;
  /** Rejects when the server refuses; the field then stays, with the reason. */
  onRenameSave: (patch: BoardDetailsPatch) => Promise<void>;
  onRenameEnd: () => void;
  onDelete: () => void;
  /** You may archive, unarchive and delete it: you made it, or run its workspace. */
  canManage: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  className?: string;
}

/**
 * The colour tag, the name, and when it last changed. Hovering the row, or
 * focusing it from the keyboard, reveals a menu button in the date's place, so
 * the list stays a list of names rather than of controls.
 *
 * An archived board's row is quieter, and opens the board read-only.
 */
function BoardRow({
  board,
  current,
  portalContainer,
  onOpen,
  renaming,
  onRename,
  onRenameSave,
  onRenameEnd,
  onDelete,
  canManage,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
  className,
  ...item
}: BoardRowProps & Omit<ComponentPropsWithoutRef<'li'>, keyof BoardRowProps | 'children'>) {
  if (renaming) {
    return (
      <SidebarMenuItem className={className} {...item}>
        <BoardNameField
          board={board}
          portalContainer={portalContainer}
          onSave={onRenameSave}
          onEnd={onRenameEnd}
        />
      </SidebarMenuItem>
    );
  }

  const archived = Boolean(board.archivedAt);
  return (
    <SidebarMenuItem className={className} {...item}>
      <SidebarMenuButton
        isActive={current}
        aria-current={current ? 'page' : undefined}
        tooltip={board.title}
        onClick={(event) => {
          onOpen();
          // A double press renames the board where it stands, as the menu's
          // Rename does — not an archived one, which is read-only.
          if (archived || !isSecondPress(board.id, event)) return;
          // The first press opened it; this sidebar may go before the rename shows.
          if (!current) carryRename(board.id);
          onRename();
        }}
        data-testid={`sidebar-board-${board.id}`}
        // The date runs to the edge; the menu button covers it on hover rather
        // than the row keeping a gap for a button that isn't there.
        className={cn(
          'group-has-data-[sidebar=menu-action]/menu-item:pr-2',
          glideRowClasses,
          archived && 'text-sidebar-foreground/60',
        )}
      >
        {/* Sized as an icon, so the dot sits in the rail's icon column. */}
        <span className={cn('grid size-4 shrink-0 place-items-center', archived && 'opacity-60')}>
          <ColorDot color={board.color} />
        </span>
        <span className="min-w-0 flex-1 truncate">{board.title}</span>
      </SidebarMenuButton>
      <BoardRowMenu
        board={board}
        portalContainer={portalContainer}
        canManage={canManage}
        onPin={onPin}
        onUnpin={onUnpin}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onRename={onRename}
        onDelete={onDelete}
      />
    </SidebarMenuItem>
  );
}

const MAX_BOARD_TITLE = 200;

/**
 * A board's row as a name field, for renaming it where it stands — and
 * retagging it: the dot at its start opens the seven tag colours.
 *
 * The name and the colour are saved together: Enter saves, and so does
 * clicking away; Escape leaves both as they were. The field holds the new
 * values while the server answers, so the row doesn't flick back to the old
 * ones, and a refusal keeps it open with the reason under it.
 */
function BoardNameField({
  board,
  portalContainer,
  onSave,
  onEnd,
}: {
  board: BoardSummary;
  portalContainer: HTMLElement | null;
  onSave: (patch: BoardDetailsPatch) => Promise<void>;
  onEnd: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(board.title);
  const [color, setColor] = useState<BoardColor>(board.color);
  const colourKey = BOARD_COLORS.find((it) => it.value === color)?.labelKey;
  const colourName = colourKey ? t(colourKey) : color;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Set once Enter, Escape or a save has settled it, so the blur that follows
  // doesn't save a second time.
  const settled = useRef(false);
  // While the colours are open, focus is in their menu, not gone for good.
  const picking = useRef(false);
  // Coming back from the colours, the name keeps its caret rather than being
  // selected again.
  const keepSelection = useRef(false);

  // Focused on the frame after it appears: chosen from the row's menu, focus
  // would go straight back to the menu, which holds on to it until it closes.
  const attach = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    if (!input) return;
    // At once as well, while the double press that asked for it is still
    // going on: a phone only brings its keyboard up for a field focused from
    // the tap itself.
    input.focus();
    requestAnimationFrame(() => input.focus());
  }, []);

  const save = () => {
    if (settled.current || saving || picking.current) return;
    const title = draft.trim();
    const patch: BoardDetailsPatch = {};
    if (title && title !== board.title) patch.title = title;
    if (color !== board.color) patch.color = color;
    if (patch.title === undefined && patch.color === undefined) {
      settled.current = true;
      onEnd();
      return;
    }
    setSaving(true);
    setError(null);
    onSave(patch).then(
      () => {
        settled.current = true;
        onEnd();
      },
      (err: unknown) => {
        setSaving(false);
        setError(err instanceof Error ? err.message : t('boards.saveFailed'));
        requestAnimationFrame(() => inputRef.current?.focus());
      },
    );
  };

  // A press anywhere else saves, as leaving the field does. The canvas keeps
  // a press from moving focus, so the field would otherwise never hear of it.
  // A press in the colours is still inside, though they sit elsewhere.
  const latestSave = useRef(save);
  latestSave.current = save;
  useEffect(() => {
    const pressed = (event: PointerEvent) => {
      const target = event.target as Element;
      if (boxRef.current?.contains(target) || target.closest?.('[data-board-colours]')) return;
      latestSave.current();
    };
    document.addEventListener('pointerdown', pressed, true);
    return () => document.removeEventListener('pointerdown', pressed, true);
  }, []);

  return (
    <div
      ref={boxRef}
      className="flex flex-col gap-1"
      // Leaving the field saves — but not for its own colour button, or the
      // colours it opens.
      onBlur={(event) => {
        const next = event.relatedTarget as Element | null;
        if (next && (boxRef.current?.contains(next) || next.closest('[data-board-colours]'))) {
          return;
        }
        save();
      }}
    >
      <div
        className={cn(
          'flex h-8 w-full items-center gap-1 rounded-md bg-sidebar-accent pr-1 pl-1 ring-2 ring-sidebar-ring ring-inset',
          saving && 'opacity-60',
        )}
      >
        <InlineDropdownMenu
          onOpenChange={(open) => {
            picking.current = open;
          }}
        >
          <InlineDropdownMenuTrigger
            disabled={saving}
            aria-label={t('boards.colourTagIs', { colour: colourName })}
            title={t('boards.colourTag')}
            data-testid={`sidebar-board-colour-${board.id}`}
            className="flex h-6 shrink-0 items-center gap-0.5 rounded px-1 text-sidebar-foreground/60 outline-hidden transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-foreground/10"
          >
            <span className="grid size-4 place-items-center">
              <ColorDot color={color} />
            </span>
            <ChevronDown className="size-3" aria-hidden="true" />
          </InlineDropdownMenuTrigger>
          <InlineDropdownMenuContent
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            container={portalContainer}
            aria-label={t('boards.colourTag')}
            data-board-colours=""
            // Back to the name, caret where it was, rather than to the button.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              keepSelection.current = true;
              inputRef.current?.focus();
            }}
          >
            <InlineDropdownMenuRadioGroup
              value={color}
              onValueChange={(next) => setColor(next as BoardColor)}
            >
              {BOARD_COLORS.map((option) => (
                <InlineDropdownMenuChoiceItem
                  key={option.value}
                  value={option.value}
                  data-testid={`board-colour-${option.value}`}
                  icon={
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: option.swatch }}
                    />
                  }
                >
                  {t(option.labelKey)}
                </InlineDropdownMenuChoiceItem>
              ))}
            </InlineDropdownMenuRadioGroup>
          </InlineDropdownMenuContent>
        </InlineDropdownMenu>
        <input
          ref={attach}
          value={draft}
          maxLength={MAX_BOARD_TITLE}
          readOnly={saving}
          aria-label={t('boards.name')}
          aria-invalid={error !== null || undefined}
          data-testid={`sidebar-board-rename-${board.id}`}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            if (keepSelection.current) keepSelection.current = false;
            else event.currentTarget.select();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            } else if (event.key === 'Escape') {
              // Leaves the name and colour as they were, without the board
              // hearing Escape.
              event.stopPropagation();
              settled.current = true;
              onEnd();
            }
          }}
          className="min-w-0 flex-1 bg-transparent pl-1 text-sm text-sidebar-accent-foreground outline-hidden"
        />
      </div>
      {error && (
        <p role="alert" className="px-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * What can be done to one board, beside the sidebar over the canvas as its
 * other menus open.
 *
 * Pinning is yours alone, so it is offered on every board you can see.
 * Archiving takes the board out of everyone's list, so only whoever may
 * delete it is offered it. An archived board can only be brought back or
 * deleted: it is read-only until it is unarchived. Delete is last and apart,
 * the one entry that discards work.
 */
function BoardRowMenu({
  board,
  portalContainer,
  canManage,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
  onRename,
  onDelete,
}: Pick<
  BoardRowProps,
  | 'board'
  | 'portalContainer'
  | 'canManage'
  | 'onPin'
  | 'onUnpin'
  | 'onArchive'
  | 'onUnarchive'
  | 'onRename'
  | 'onDelete'
>) {
  const t = useT();
  const archived = Boolean(board.archivedAt);
  return (
    <InlineDropdownMenu>
      <SidebarMenuAction showOnHover asChild>
        <InlineDropdownMenuTrigger
          aria-label={t('boards.moreActionsFor', { title: board.title })}
          title={t('common.more')}
          data-testid={`sidebar-board-menu-${board.id}`}
        >
          <Ellipsis aria-hidden="true" />
        </InlineDropdownMenuTrigger>
      </SidebarMenuAction>
      <InlineDropdownMenuContent
        side="right"
        align="start"
        // Flush with the sidebar's edge, where Preferences opens too: the
        // button sits 4px in from the row's end, and the row 8px in from it.
        sideOffset={12}
        collisionPadding={8}
        container={portalContainer}
        aria-label={board.title}
      >
        {archived ? (
          canManage && (
            <>
              <InlineDropdownMenuItem
                icon={<ArchiveRestore aria-hidden="true" />}
                onSelect={onUnarchive}
                data-testid="board-menu-unarchive"
              >
                {t('boards.unarchive')}
              </InlineDropdownMenuItem>
              <InlineDropdownMenuSeparator />
            </>
          )
        ) : (
          <>
            {board.pin ? (
              <InlineDropdownMenuItem
                icon={<PinOff aria-hidden="true" />}
                onSelect={onUnpin}
                data-testid="board-menu-unpin"
              >
                {t('boards.unpin')}
              </InlineDropdownMenuItem>
            ) : (
              <InlineDropdownMenuItem
                icon={<Pin aria-hidden="true" />}
                onSelect={onPin}
                data-testid="board-menu-pin"
              >
                {t('boards.pin')}
              </InlineDropdownMenuItem>
            )}
            {canManage && (
              <InlineDropdownMenuItem
                icon={<Archive aria-hidden="true" />}
                onSelect={onArchive}
                data-testid="board-menu-archive"
              >
                {t('boards.archive')}
              </InlineDropdownMenuItem>
            )}
            <InlineDropdownMenuSeparator />
            {/* In place, on the row itself — no window, so no ellipsis. The board
                card's pencil and Manage still open Rename board, which also sets
                the colour. */}
            <InlineDropdownMenuItem
              icon={<Pencil aria-hidden="true" />}
              onSelect={onRename}
              data-testid="board-menu-rename"
            >
              {t('common.rename')}
            </InlineDropdownMenuItem>
            <InlineDropdownMenuSeparator />
          </>
        )}
        <InlineDropdownMenuItem
          icon={<Trash2 aria-hidden="true" />}
          onSelect={onDelete}
          data-testid="board-menu-delete"
          className={menuDangerRowClasses}
        >
          {t('common.deleteEllipsis')}
        </InlineDropdownMenuItem>
      </InlineDropdownMenuContent>
    </InlineDropdownMenu>
  );
}
