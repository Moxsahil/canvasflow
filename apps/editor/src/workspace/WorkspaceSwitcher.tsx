import { useCallback, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  identityDetailClasses,
  identityRowClasses,
  InitialBadge,
} from '@/components/ui/initial-badge';
import { MenuBadge, MenuRowEnd, menuButtonRowClasses } from '@/components/ui/menu-look';
import { SidebarMenuItem } from '@/components/ui/sidebar';
import { Workspaces, WorkspaceContent, WorkspaceTrigger } from '@/components/ui/workspaces';
import type { BoardSwitcherState } from './useBoardSwitcher';

interface WorkspaceSwitcherProps {
  state: BoardSwitcherState;
  /** Where the popup portals to — see PopoverContent's `container`. */
  portalContainer: HTMLElement | null;
}

/** Quiet lines where a row would be. */
const noteClasses = 'px-2 py-1.5 text-xs text-neutral-500 dark:text-neutral-400';

const errorClasses = 'text-red-500 dark:text-red-400';

const boardCount = (count: number) => (count === 1 ? '1 board' : `${count} boards`);

/**
 * The workspace at the top of the sidebar, and the way to list another one.
 *
 * Picking a workspace lists its boards in the sidebar below rather than
 * opening one: the list is where a board is opened, so the header only has to
 * say whose boards those are. Creating and managing workspaces live here too.
 *
 * A guest let in by share link has no workspace at all, and gets the open
 * board's name as a plain header instead of a menu that could only be empty.
 */
export function WorkspaceSwitcher({ state, portalContainer }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [namingWorkspace, setNamingWorkspace] = useState(false);

  const { workspaces, dismissError, beginManage, browseWorkspace } = state;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        // Nothing about the last visit should survive into the next one.
        setNamingWorkspace(false);
        dismissError();
      }
    },
    [dismissError],
  );

  const listedId = state.browsedWorkspaceId ?? state.workspaceId;
  const listed = workspaces?.find((workspace) => workspace.id === listedId);

  if (!state.available) {
    return (
      <SidebarMenuItem>
        {/* Not interactive, so it takes the row's shape without its affordances. */}
        <div className={cn(identityRowClasses, 'hover:bg-transparent')} title={state.title}>
          <InitialBadge label={state.title} className="rounded-full" />
          <Lines primary={state.title} secondary="Board" />
        </div>
      </SidebarMenuItem>
    );
  }

  // Still loading, or the token hasn't said which workspace yet: the row keeps
  // its place so the list below doesn't jump when the name arrives.
  if (!workspaces || !listed) {
    return (
      <SidebarMenuItem>
        <div className={cn(identityRowClasses, 'hover:bg-transparent')} aria-busy="true">
          <span aria-hidden="true" className="size-8 shrink-0 rounded-full bg-sidebar-accent" />
          <Lines primary="Workspace" secondary="Loading…" />
        </div>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <Workspaces
        workspaces={workspaces}
        selectedWorkspaceId={listed.id}
        open={open}
        onOpenChange={handleOpenChange}
        onWorkspaceChange={(workspace) => browseWorkspace(workspace.id)}
      >
        <WorkspaceTrigger
          title={listed.name}
          aria-label={`${listed.name} — switch workspace`}
          data-testid="workspace-switcher"
          className={identityRowClasses}
          renderTrigger={() => (
            <>
              {/* A circle, like the account at the foot: the header names who the
                  boards belong to rather than being another board. */}
              <InitialBadge label={listed.name} src={listed.logoUrl} className="rounded-full" />
              <Lines primary={listed.name} secondary={boardCount(listed.boardCount)} />
              <ChevronsUpDown className={cn('ml-auto size-4 shrink-0', identityDetailClasses)} />
            </>
          )}
        />

        <WorkspaceContent
          // Down from the header, inside the sidebar: the menu is about what
          // the sidebar lists, so it stays over the list it changes. As wide as
          // the header row, collapse button included — the sidebar's 16rem
          // less its padding. The rail has no workspace row to open it from.
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-60 max-w-none"
          container={portalContainer}
          renderWorkspace={(workspace, selected) => {
            const full = workspaces.find((it) => it.id === workspace.id);
            return (
              <>
                {/* Each workspace wears the badge the header shows for it, so
                    the one picked reads as the same thing once it is up there. */}
                <span className="flex min-w-0 items-center gap-2">
                  <InitialBadge
                    label={workspace.name}
                    src={full?.logoUrl}
                    className="size-5 rounded-full text-[10px]"
                  />
                  <span className="min-w-0 truncate">{workspace.name}</span>
                </span>
                {/* The tick's column is held open on every row, so the counts
                    stay lined up whichever workspace is listed. */}
                <MenuRowEnd
                  badge={<MenuBadge>{boardCount(full?.boardCount ?? 0)}</MenuBadge>}
                  icon={selected ? <Check aria-hidden="true" /> : <span aria-hidden="true" />}
                />
              </>
            );
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
                handleOpenChange(false);
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
          {/* Last: creating is the common errand, tidying up the occasional
              one, and this is the row that opens a dialog. The dialog is modal,
              so the menu steps out of its way rather than waiting behind it. */}
          <button
            type="button"
            className={menuButtonRowClasses}
            data-testid="manage-workspaces"
            onClick={() => {
              beginManage({ kind: 'workspaces' });
              handleOpenChange(false);
            }}
          >
            <span>Manage workspaces</span>
            <MenuRowEnd icon={<Settings2 aria-hidden="true" />} />
          </button>
        </WorkspaceContent>
      </Workspaces>
    </SidebarMenuItem>
  );
}

/** The two lines of an identity row, which the collapsed rail hides. */
function Lines({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <span
      className={cn('grid min-w-0 flex-1 text-left text-sm leading-tight', identityDetailClasses)}
    >
      <span className="truncate font-medium">{primary}</span>
      <span className="truncate text-xs opacity-70">{secondary}</span>
    </span>
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
