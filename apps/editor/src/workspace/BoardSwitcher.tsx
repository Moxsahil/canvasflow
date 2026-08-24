import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronRight, ChevronsUpDown, Pencil, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  identityDetailClasses,
  identityRowClasses,
  InitialBadge,
} from '@/components/ui/initial-badge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { SidebarMenuItem } from '@/components/ui/sidebar';
import { Workspaces, WorkspaceContent, WorkspaceTrigger } from '@/components/ui/workspaces';
import { boardSwatch } from './board-colors';
import type { BoardSwitcherState } from './useBoardSwitcher';
import type { BoardColor, WorkspaceSummary } from './workspace-api';

interface BoardSwitcherProps {
  state: BoardSwitcherState;
  /** Where the popups portal to — see PopoverContent's `container`. */
  portalContainer: HTMLElement | null;
}

/** Rows in both panels, so the switcher reads as one surface with the sidebar. */
const rowClasses =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';

const panelClasses = 'flex max-h-80 w-64 flex-col p-0';

/**
 * A board row holds two controls — open, and rename — so it is a container
 * rather than the single button the other rows are. The hover and focus
 * treatment moves to the container so the row still lights up as one thing.
 */
const boardRowClasses =
  'group/board flex w-full items-center gap-1 rounded-md py-1.5 pl-2 pr-1 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground has-[:focus-visible]:bg-sidebar-accent';

/** The board's colour tag. Purely decorative — the name beside it is the label. */
function ColorDot({ color, className }: { color: BoardColor; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: boardSwatch(color) }}
    />
  );
}

/**
 * The board identity in the sidebar header, and the only way to reach another
 * board.
 *
 * Clicking it opens the workspaces the user belongs to; expanding one shows
 * its boards beside it, which is where a board is opened, created, or renamed.
 * This replaced a separate board-list page in the web app — the editor is the
 * app, so browsing boards belongs in it rather than a route you have to leave
 * the canvas for.
 *
 * A caller with no workspaces to show — a guest let in by share link — gets
 * the plain, unclickable header instead of a menu that could only be empty.
 */
export function BoardSwitcher({ state, portalContainer }: BoardSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [namingWorkspace, setNamingWorkspace] = useState(false);

  const { workspaces, expandWorkspace, dismissError, beginRename } = state;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        // Nothing about the last visit should survive into the next one.
        expandWorkspace(null);
        setNamingWorkspace(false);
        dismissError();
      }
    },
    [expandWorkspace, dismissError],
  );

  // The dialog is modal, so the menu that opened it steps out of the way
  // rather than sitting behind the backdrop waiting to be dismissed twice.
  // The dialog itself belongs to the sidebar, which also opens it from its own
  // "Rename board" row without going through this menu at all.
  const handleRename = useCallback(
    (id: string) => {
      beginRename(id);
      handleOpenChange(false);
    },
    [beginRename, handleOpenChange],
  );

  const byId = useMemo(
    () => new Map((workspaces ?? []).map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );

  // The workspace the board sits in, named under the board's own title — the
  // two lines together say where you are, as the account row does at the foot.
  const workspaceName = workspaces?.find((workspace) => workspace.id === state.workspaceId)?.name;

  // Whether there is a board list behind the header. It also decides whether
  // the colour tag is worth drawing: without the list the board's own colour
  // hasn't been fetched, and a dot showing gray for a purple board is worse
  // than no dot at all.
  const hasList = state.available && workspaces !== null && workspaces.length > 0;

  const identity = (
    <>
      <InitialBadge label={state.title} />
      <span
        className={cn('grid min-w-0 flex-1 text-left text-sm leading-tight', identityDetailClasses)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {hasList && <ColorDot color={state.color} />}
          <span className="truncate font-medium">{state.title}</span>
        </span>
        <span className="truncate text-xs opacity-70">{workspaceName ?? 'Board'}</span>
      </span>
      {hasList && (
        <ChevronsUpDown className={cn('ml-auto size-4 shrink-0', identityDetailClasses)} />
      )}
    </>
  );

  // No list to show: the header is a plain label rather than a button that
  // opens nothing. Not a SidebarMenuButton either — it does nothing on click,
  // so it should not offer the hover and focus affordances of one.
  if (!hasList) {
    return (
      <SidebarMenuItem>
        {/* Not interactive, so it takes the row's shape without its affordances. */}
        <div className={cn(identityRowClasses, 'hover:bg-transparent')} title={state.title}>
          {identity}
        </div>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <Workspaces
        workspaces={workspaces}
        selectedWorkspaceId={state.workspaceId ?? undefined}
        open={open}
        onOpenChange={handleOpenChange}
        // Picking a workspace opens its boards beside the list; dismissing the
        // menu at that moment would take away the thing that was just asked for.
        closeOnSelect={false}
        onWorkspaceChange={(workspace) => expandWorkspace(workspace.id)}
      >
        <WorkspaceTrigger
          title={state.title}
          aria-label={`${state.title} — boards and workspaces`}
          data-testid="board-switcher"
          className={identityRowClasses}
          renderTrigger={() => identity}
        />

        <WorkspaceContent
          side="right"
          align="start"
          className="w-64"
          container={portalContainer}
          data-workspace-menu=""
          // The board panel is a popup of its own, so every pointer and focus
          // event in it lands outside this one. Without this, reaching for a
          // board would dismiss the menu holding it open.
          onInteractOutside={(event) => {
            if (isInside(event.target, '[data-board-panel]')) event.preventDefault();
          }}
          renderWorkspace={(workspace) => {
            const full = byId.get(workspace.id);
            return full ? (
              <WorkspaceRow
                workspace={full}
                state={state}
                portalContainer={portalContainer}
                expanded={state.expandedWorkspaceId === full.id}
                onRename={handleRename}
              />
            ) : null;
          }}
        >
          {state.error && <p className="px-2 py-1.5 text-xs text-destructive">{state.error}</p>}
          {namingWorkspace ? (
            <NewWorkspaceForm
              busy={state.busy}
              onCancel={() => setNamingWorkspace(false)}
              onCreate={(name) => {
                setNamingWorkspace(false);
                state.createWorkspace(name);
              }}
            />
          ) : (
            <button
              type="button"
              className={cn(rowClasses, 'text-sidebar-foreground/70')}
              disabled={state.busy}
              onClick={() => setNamingWorkspace(true)}
            >
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              <span>Create workspace</span>
            </button>
          )}
        </WorkspaceContent>
      </Workspaces>
    </SidebarMenuItem>
  );
}

interface WorkspaceRowProps {
  workspace: WorkspaceSummary;
  state: BoardSwitcherState;
  portalContainer: HTMLElement | null;
  expanded: boolean;
  onRename: (boardId: string) => void;
}

/**
 * One workspace, with its boards in a panel to the right.
 *
 * The panel is anchored to the row rather than to the menu, so it lines up
 * with whichever workspace the pointer is on. Hover opens it — this reads as a
 * submenu — and clicking does the same, which is what a keyboard gets.
 */
function WorkspaceRow({
  workspace,
  state,
  portalContainer,
  expanded,
  onRename,
}: WorkspaceRowProps) {
  const entry = state.boardsFor(workspace.id);

  return (
    <Popover
      open={expanded}
      onOpenChange={(next) => {
        if (!next) state.expandWorkspace(null);
      }}
    >
      <PopoverAnchor asChild>
        <span
          className="flex min-w-0 flex-1 items-center gap-2"
          onMouseEnter={() => state.expandWorkspace(workspace.id)}
        >
          <InitialBadge
            label={workspace.name}
            src={workspace.logoUrl}
            className="size-6 rounded-md text-[0.625rem]"
          />
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="w-full truncate text-sm">{workspace.name}</span>
            <span className="text-xs opacity-60">
              {workspace.boardCount === 1 ? '1 board' : `${workspace.boardCount} boards`}
            </span>
          </span>
          <ChevronRight className="ml-auto size-4 shrink-0 opacity-60" />
        </span>
      </PopoverAnchor>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        container={portalContainer}
        className={panelClasses}
        data-board-panel=""
        // Opened by hover, so it must not pull focus off whatever the pointer
        // left behind — nor throw focus back on the way out.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // The workspace list is outside this panel, so pressing a row in it
        // would otherwise dismiss the panel a moment before the click reopens
        // it — a flicker on every click. Which workspace is expanded is state
        // the menu owns; closing the menu unmounts this with it.
        onInteractOutside={(event) => {
          if (isInside(event.target, '[data-workspace-menu]')) event.preventDefault();
        }}
      >
        <div className="shrink-0 border-b border-sidebar-border px-3 py-2">
          <p className="truncate text-xs font-medium text-sidebar-foreground/70">
            {workspace.name}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {entry?.status === 'ready' && entry.boards.length === 0 && (
            <p className="px-2 py-2 text-sm text-sidebar-foreground/70">No boards yet.</p>
          )}
          {(entry === undefined || entry.status === 'loading') && (
            <p className="px-2 py-2 text-sm text-sidebar-foreground/70">Loading boards…</p>
          )}
          {entry?.status === 'error' && (
            <button
              type="button"
              className={cn(rowClasses, 'text-destructive')}
              onClick={() => state.expandWorkspace(workspace.id)}
            >
              <span className="truncate">{entry.error} Try again.</span>
            </button>
          )}
          {entry?.status === 'ready' &&
            entry.boards.map((board) => {
              const current = board.id === state.boardId;
              return (
                <div
                  key={board.id}
                  className={cn(
                    boardRowClasses,
                    current && 'bg-sidebar-accent text-sidebar-accent-foreground',
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-sm outline-hidden ring-sidebar-ring focus-visible:ring-2"
                    aria-current={current ? 'page' : undefined}
                    onClick={() => state.openBoard(board.id)}
                  >
                    <ColorDot color={board.color} />
                    <span className="min-w-0 flex-1 truncate">{board.title}</span>
                    {current ? (
                      <Check className="size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <span className="shrink-0 text-xs opacity-60">
                        {formatUpdatedAt(board.updatedAt)}
                      </span>
                    )}
                  </button>
                  {/* Revealed by hovering the row, and by focus for a keyboard,
                      so the list stays a list of names rather than of controls. */}
                  <button
                    type="button"
                    // Opacity says whether it is revealed; colour says whether
                    // it is under the pointer. Two properties rather than two
                    // opacities, which would fight over which variant wins.
                    className="shrink-0 rounded-sm p-1 text-sidebar-foreground/60 opacity-0 outline-hidden ring-sidebar-ring transition-opacity hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-2 group-hover/board:opacity-100"
                    aria-label={`Rename ${board.title}`}
                    title="Rename board"
                    onClick={() => onRename(board.id)}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
        </div>

        <div className="shrink-0 border-t border-sidebar-border p-1">
          <button
            type="button"
            className={cn(rowClasses, 'text-sidebar-foreground/70')}
            disabled={state.busy}
            onClick={() => state.createBoard(workspace.id)}
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            <span>New board</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface NewWorkspaceFormProps {
  busy: boolean;
  onCreate: (name: string) => void;
  onCancel: () => void;
}

/** Naming happens in place: a dialog for one text field would be heavier than the act. */
function NewWorkspaceForm({ busy, onCreate, onCancel }: NewWorkspaceFormProps) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  return (
    <form
      className="flex items-center gap-1 px-1 py-0.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onCreate(trimmed);
      }}
    >
      <input
        // Focused on sight: it replaced the button that was just clicked, and
        // there is nothing else in the form to reach for.
        autoFocus
        value={name}
        maxLength={60}
        placeholder="Workspace name"
        aria-label="Workspace name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            // Back to the button, without taking the whole menu down with it.
            event.stopPropagation();
            onCancel();
          }
        }}
        className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1.5 text-sm outline-hidden ring-sidebar-ring placeholder:text-sidebar-foreground/50 focus-visible:ring-2"
      />
      <button
        type="submit"
        disabled={busy || !trimmed}
        className={cn(rowClasses, 'w-auto shrink-0 px-2 text-sidebar-foreground/70')}
      >
        Add
      </button>
    </form>
  );
}

/** Short enough to sit beside a title without crowding it. */
function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Whether an event landed in the switcher's other panel rather than outside it. */
function isInside(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}
