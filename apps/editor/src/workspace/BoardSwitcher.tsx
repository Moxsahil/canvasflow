import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronRight, ChevronsUpDown, Pencil, Plus, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  identityDetailClasses,
  identityRowClasses,
  InitialBadge,
} from '@/components/ui/initial-badge';
import {
  MenuBadge,
  MenuRowEnd,
  menuButtonRowClasses,
  menuLabelClasses,
  menuPopoverClasses,
  menuSeparatorClasses,
} from '@/components/ui/menu-look';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { SidebarMenuItem } from '@/components/ui/sidebar';
import { Workspaces, WorkspaceContent, WorkspaceTrigger } from '@/components/ui/workspaces';
import { BoardTitle, ColorDot, formatUpdatedAt } from './board-presentation';
import type { BoardSwitcherState, ManageTarget } from './useBoardSwitcher';
import type { WorkspaceSummary } from './workspace-api';

interface BoardSwitcherProps {
  state: BoardSwitcherState;
  /** Where the popups portal to — see PopoverContent's `container`. */
  portalContainer: HTMLElement | null;
}

/**
 * Both panels wear the editor's menu look, as the other menus that open from
 * the sidebar do. The board panel keeps its footer in view while the list
 * above it scrolls, so it caps its height and scrolls the list alone.
 */
const boardPanelClasses = cn(menuPopoverClasses, 'max-h-80 overflow-hidden');

/** Quiet lines where a row would be: loading, and nothing to list. */
const noteClasses = 'px-2 py-1.5 text-xs text-neutral-500 dark:text-neutral-400';

const errorClasses = 'text-red-500 dark:text-red-400';

/**
 * A board row holds two controls — open, and rename — so it is a container
 * rather than the single button the other rows are. The hover and focus
 * treatment moves to the container so the row still lights up as one thing.
 */
const boardRowClasses =
  'group/board flex w-full items-center gap-1 rounded py-0.5 pr-1 pl-0 text-xs hover:bg-neutral-950/10 has-focus-visible:bg-neutral-950/10 dark:hover:bg-neutral-50/10 dark:has-focus-visible:bg-neutral-50/10';

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

  const { workspaces, expandWorkspace, dismissError, beginRename, beginManage } = state;

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

  // Same arrangement for the manage dialog, and for the same reason.
  const handleManage = useCallback(
    (target: ManageTarget) => {
      beginManage(target);
      handleOpenChange(false);
    },
    [beginManage, handleOpenChange],
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
                onManage={handleManage}
              />
            ) : null;
          }}
        >
          {state.error && <p className={cn(noteClasses, errorClasses)}>{state.error}</p>}
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
              className={menuButtonRowClasses}
              disabled={state.busy}
              onClick={() => setNamingWorkspace(true)}
            >
              <span>Create workspace</span>
              <MenuRowEnd icon={<Plus aria-hidden="true" />} />
            </button>
          )}
          {/* Last in the footer: creating is the common errand, tidying up is
              the occasional one, and this is the row that opens a dialog. */}
          <button
            type="button"
            className={menuButtonRowClasses}
            data-testid="manage-workspaces"
            onClick={() => handleManage({ kind: 'workspaces' })}
          >
            <span>Manage workspaces</span>
            <MenuRowEnd icon={<Settings2 aria-hidden="true" />} />
          </button>
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
  onManage: (target: ManageTarget) => void;
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
  onManage,
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
          className="flex min-w-0 flex-1 items-center gap-3"
          // Lights the whole row in the list for as long as its boards are up,
          // the way a submenu's row stays lit — see WorkspaceContent.
          data-expanded={expanded ? '' : undefined}
          onMouseEnter={() => state.expandWorkspace(workspace.id)}
        >
          <span className="min-w-0 truncate">{workspace.name}</span>
          <MenuRowEnd
            badge={
              <MenuBadge>
                {workspace.boardCount === 1 ? '1 board' : `${workspace.boardCount} boards`}
              </MenuBadge>
            }
            icon={<ChevronRight aria-hidden="true" />}
          />
        </span>
      </PopoverAnchor>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        container={portalContainer}
        className={boardPanelClasses}
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
        <p className={cn(menuLabelClasses, 'shrink-0')}>{workspace.name}</p>

        <div className="flex min-h-0 w-full flex-1 flex-col gap-y-1 overflow-y-auto">
          {entry?.status === 'ready' && entry.boards.length === 0 && (
            <p className={noteClasses}>No boards yet.</p>
          )}
          {(entry === undefined || entry.status === 'loading') && (
            <p className={noteClasses}>Loading boards…</p>
          )}
          {entry?.status === 'error' && (
            <button
              type="button"
              className={cn(menuButtonRowClasses, errorClasses)}
              onClick={() => state.expandWorkspace(workspace.id)}
            >
              <span className="truncate">{entry.error} Try again.</span>
            </button>
          )}
          {entry?.status === 'ready' &&
            entry.boards.map((board) => {
              const current = board.id === state.boardId;
              return (
                <div key={board.id} className={boardRowClasses}>
                  {/* The tagged title on the left; on the right, when it last
                      changed — or a tick for the board already open, as the
                      context menu's Move to marks it. */}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded px-2 py-1 text-left outline-none"
                    aria-current={current ? 'page' : undefined}
                    onClick={() => state.openBoard(board.id)}
                  >
                    <BoardTitle title={board.title} color={board.color} />
                    <MenuRowEnd
                      badge={
                        current ? null : <MenuBadge>{formatUpdatedAt(board.updatedAt)}</MenuBadge>
                      }
                      icon={current ? <Check aria-hidden="true" /> : null}
                    />
                  </button>
                  {/* Revealed by hovering the row, and by focus for a keyboard,
                      so the list stays a list of names rather than of controls. */}
                  <button
                    type="button"
                    // Opacity says whether it is revealed; colour says whether
                    // it is under the pointer. Two properties rather than two
                    // opacities, which would fight over which variant wins.
                    className="shrink-0 rounded p-1 text-neutral-500 opacity-0 outline-none transition-opacity group-hover/board:opacity-100 hover:text-neutral-950 focus-visible:opacity-100 dark:text-neutral-400 dark:hover:text-neutral-50"
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

        <div role="separator" className={menuSeparatorClasses} />
        <button
          type="button"
          className={menuButtonRowClasses}
          disabled={state.busy}
          onClick={() => state.createBoard(workspace.id)}
        >
          <span>New board</span>
          <MenuRowEnd icon={<Plus aria-hidden="true" />} />
        </button>
        {/* Scoped to this workspace, so the dialog opens straight onto the
            list that is already on screen rather than making you find it. */}
        <button
          type="button"
          className={menuButtonRowClasses}
          data-testid="manage-boards"
          onClick={() => onManage({ kind: 'boards', workspaceId: workspace.id })}
        >
          <span>Manage boards</span>
          <MenuRowEnd icon={<Settings2 aria-hidden="true" />} />
        </button>
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
      className="flex w-full items-center gap-1"
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
        className="min-w-0 flex-1 rounded bg-neutral-950/5 px-2 py-1.5 text-xs outline-none placeholder:text-neutral-500 focus-visible:ring-1 focus-visible:ring-neutral-400 dark:bg-neutral-50/5 dark:placeholder:text-neutral-400 dark:focus-visible:ring-neutral-500"
      />
      <button
        type="submit"
        disabled={busy || !trimmed}
        className={cn(menuButtonRowClasses, 'w-auto shrink-0')}
      >
        Add
      </button>
    </form>
  );
}

/** Whether an event landed in the switcher's other panel rather than outside it. */
function isInside(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}
