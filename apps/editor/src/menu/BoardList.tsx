import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  ChevronDown,
  Ellipsis,
  Pencil,
  Pin,
  Plus,
  RotateCw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuDangerRowClasses } from '@/components/ui/menu-look';
import {
  InlineDropdownMenu,
  InlineDropdownMenuBadge,
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
import { ColorDot, formatUpdatedAt } from '../workspace/board-presentation';
import { DeleteWarningDialog } from '../workspace/DeleteWarningDialog';
import type { BoardColor, BoardSummary, BoardSwitcherState } from '../workspace';
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
  const [renamingId, setRenamingId] = useState<string | null>(null);

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
        setDeleteError(err instanceof Error ? err.message : 'Something went wrong.'),
    );
  }, [pendingDelete, deleteBoard]);

  // Focused once the sidebar has opened: the field is not on screen in the
  // rail, and a hidden input cannot take focus.
  useEffect(() => {
    if (!findRequested || collapsed) return;
    inputRef.current?.focus();
    setFindRequested(false);
  }, [findRequested, collapsed]);

  const workspaceId = state.browsedWorkspaceId ?? state.workspaceId;
  if (!state.available || !workspaceId) return null;

  const entry = state.boardsFor(workspaceId);
  const boards = entry?.status === 'ready' ? entry.boards : [];
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? boards.filter((board) => board.title.toLowerCase().includes(needle))
    : boards;

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
            placeholder="Find a board"
            aria-label="Find a board"
            data-testid="sidebar-find-board"
            className="h-8 w-full rounded-md bg-sidebar-accent/60 pr-2 pl-8 text-sm text-sidebar-foreground outline-hidden ring-sidebar-ring placeholder:text-sidebar-foreground/50 focus-visible:ring-2 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>

        <div className="flex items-center gap-0.5 pr-1 group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="flex-1">Boards</SidebarGroupLabel>
          <button
            type="button"
            className={labelActionClasses}
            aria-label="Manage boards"
            title="Manage boards"
            data-testid="manage-boards"
            onClick={() => state.beginManage({ kind: 'boards', workspaceId })}
          >
            <Settings2 aria-hidden="true" />
          </button>
          <button
            type="button"
            className={labelActionClasses}
            aria-label="New board"
            title="New board"
            data-testid="sidebar-new-board"
            disabled={state.busy}
            onClick={() => state.createBoard(workspaceId)}
          >
            <Plus aria-hidden="true" />
          </button>
        </div>

        <SidebarMenu className="max-h-[min(40vh,22rem)] overflow-y-auto [scrollbar-width:thin] group-data-[collapsible=icon]:max-h-none group-data-[collapsible=icon]:[scrollbar-width:none]">
          <RailOnly>
            <SidebarMenuButton
              tooltip="Find a board"
              onClick={() => {
                setOpen(true);
                setFindRequested(true);
              }}
            >
              <Search aria-hidden="true" />
              <span>Find a board</span>
            </SidebarMenuButton>
          </RailOnly>
          <li aria-hidden="true" className={cn(railSeparatorClasses, 'my-1')} />

          {(entry === undefined || entry.status === 'loading') &&
            [0, 1, 2].map((key) => (
              <SidebarMenuItem key={key}>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            ))}

          {entry?.status === 'error' && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Couldn’t load the boards. Try again"
                onClick={() => state.browseWorkspace(workspaceId)}
                className={menuDangerRowClasses}
              >
                <RotateCw aria-hidden="true" />
                <span>Couldn’t load the boards. Try again</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {entry?.status === 'ready' && boards.length === 0 && (
            <li className={`${noteClasses} group-data-[collapsible=icon]:hidden`}>
              No boards yet.
            </li>
          )}
          {entry?.status === 'ready' && boards.length > 0 && shown.length === 0 && (
            <li className={`${noteClasses} group-data-[collapsible=icon]:hidden`}>
              No board by that name.
            </li>
          )}

          {shown.map((board) => (
            <BoardRow
              key={board.id}
              board={board}
              current={board.id === state.boardId}
              portalContainer={portalContainer}
              onOpen={() => state.openBoard(board.id)}
              renaming={renamingId === board.id}
              onRename={() => setRenamingId(board.id)}
              onRenameSave={(patch) => state.renameBoard(board.id, patch)}
              onRenameEnd={() => setRenamingId(null)}
              onDelete={() => askToDelete(board)}
            />
          ))}

          <RailOnly>
            <SidebarMenuButton
              tooltip="New board"
              disabled={state.busy}
              onClick={() => state.createBoard(workspaceId)}
            >
              <Plus aria-hidden="true" />
              <span>New board</span>
            </SidebarMenuButton>
          </RailOnly>
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
        title={`Delete “${pendingDelete?.title ?? 'this board'}”?`}
        confirmLabel="Delete board"
        description={
          <>
            This deletes the board for everyone who can reach it, and disconnects anyone who has it
            open. You can’t undo this here.
          </>
        }
      />
    </SidebarGroup>
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
}

/**
 * The colour tag, the name, and when it last changed. Hovering the row, or
 * focusing it from the keyboard, reveals a menu button in the date's place, so
 * the list stays a list of names rather than of controls.
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
}: BoardRowProps) {
  if (renaming) {
    return (
      <SidebarMenuItem>
        <BoardNameField
          board={board}
          portalContainer={portalContainer}
          onSave={onRenameSave}
          onEnd={onRenameEnd}
        />
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={current}
        aria-current={current ? 'page' : undefined}
        tooltip={board.title}
        onClick={onOpen}
        data-testid={`sidebar-board-${board.id}`}
        // The date runs to the edge; the menu button covers it on hover rather
        // than the row keeping a gap for a button that isn't there.
        className="group-has-data-[sidebar=menu-action]/menu-item:pr-2"
      >
        {/* Sized as an icon, so the dot sits in the rail's icon column. */}
        <span className="grid size-4 shrink-0 place-items-center">
          <ColorDot color={board.color} />
        </span>
        <span className="min-w-0 flex-1 truncate">{board.title}</span>
        {/* Hidden while its menu is open too: focus has gone into the menu by
            then, and the button stays up over where the date would show. */}
        <span className="shrink-0 text-xs text-sidebar-foreground/50 tabular-nums transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 group-has-data-[state=open]/menu-item:opacity-0">
          {formatUpdatedAt(board.updatedAt)}
        </span>
      </SidebarMenuButton>
      <BoardRowMenu
        board={board}
        portalContainer={portalContainer}
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
  const [draft, setDraft] = useState(board.title);
  const [color, setColor] = useState<BoardColor>(board.color);
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
    if (input) requestAnimationFrame(() => input.focus());
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
        setError(err instanceof Error ? err.message : 'Couldn’t save the board.');
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
            aria-label={`Colour tag: ${BOARD_COLORS.find((it) => it.value === color)?.label ?? color}`}
            title="Colour tag"
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
            aria-label="Colour tag"
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
                  {option.label}
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
          aria-label="Board name"
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

function Soon() {
  return <InlineDropdownMenuBadge>Soon</InlineDropdownMenuBadge>;
}

/**
 * What can be done to one board, beside the sidebar over the canvas as its
 * other menus open. Pinning and archiving are listed ahead of being built,
 * and read "Soon" until then. Delete is last and apart, the one entry that
 * discards work.
 */
function BoardRowMenu({
  board,
  portalContainer,
  onRename,
  onDelete,
}: Pick<BoardRowProps, 'board' | 'portalContainer' | 'onRename' | 'onDelete'>) {
  return (
    <InlineDropdownMenu>
      <SidebarMenuAction showOnHover asChild>
        <InlineDropdownMenuTrigger
          aria-label={`More actions for ${board.title}`}
          title="More"
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
        <InlineDropdownMenuItem
          disabled
          icon={<Pin aria-hidden="true" />}
          badge={<Soon />}
          data-testid="board-menu-pin"
        >
          Pin to top
        </InlineDropdownMenuItem>
        <InlineDropdownMenuItem
          disabled
          icon={<Archive aria-hidden="true" />}
          badge={<Soon />}
          data-testid="board-menu-archive"
        >
          Archive
        </InlineDropdownMenuItem>
        <InlineDropdownMenuSeparator />
        {/* In place, on the row itself — no window, so no ellipsis. The board
            card's pencil and Manage still open Rename board, which also sets
            the colour. */}
        <InlineDropdownMenuItem
          icon={<Pencil aria-hidden="true" />}
          onSelect={onRename}
          data-testid="board-menu-rename"
        >
          Rename
        </InlineDropdownMenuItem>
        <InlineDropdownMenuSeparator />
        <InlineDropdownMenuItem
          icon={<Trash2 aria-hidden="true" />}
          onSelect={onDelete}
          data-testid="board-menu-delete"
          className={menuDangerRowClasses}
        >
          Delete…
        </InlineDropdownMenuItem>
      </InlineDropdownMenuContent>
    </InlineDropdownMenu>
  );
}
