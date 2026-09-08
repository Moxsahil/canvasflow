import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Settings2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InitialBadge } from '@/components/ui/initial-badge';
import { Input } from '@/components/ui/input';
import { ColorDot, formatUpdatedAt } from './board-presentation';
import { SurfaceDialog } from '../ui/SurfaceDialog';
import { SURFACE_INPUT_CLASS, SurfaceButton, SurfaceCard, SurfaceHint } from '../ui/surface-ui';
import type { SurfaceTheme } from '../ui/surface-palette';
import { DeleteWarningDialog } from './DeleteWarningDialog';
import type { BoardSwitcherState } from './useBoardSwitcher';
import type { BoardSummary, WorkspaceSummary } from './workspace-api';

const MAX_WORKSPACE_NAME = 60;

/**
 * What the delete warning is currently asking about. Null when nothing is
 * pending, which is also what closes the warning dialog.
 */
type PendingDelete =
  | { kind: 'workspace'; workspace: WorkspaceSummary }
  | { kind: 'board'; board: BoardSummary };

interface ManageDialogProps {
  state: BoardSwitcherState;
  /** The theme on screen — the dialog surface carries its own palette for each. */
  theme: SurfaceTheme;
}

/**
 * Managing what already exists: renaming workspaces and boards, and deleting
 * either.
 *
 * The switcher's two panels are where you *go* somewhere — pick a workspace,
 * open a board — and adding to them is a single row in each footer. Changing
 * or removing something is a different errand, and putting it in the same
 * panels would turn a menu you click through quickly into a row of controls to
 * be careful around. So it lives here, one dialog reached from either panel,
 * showing whichever list you asked for.
 *
 * On the app's dialog surface, like every other window that stops the board.
 *
 * Nothing here decides what a person may do; it only declines to offer what
 * the server would refuse. The rules themselves live in the routes.
 */
export function ManageDialog({ state, theme }: ManageDialogProps) {
  const target = state.manageTarget;
  const { expandWorkspace, endManage, beginManage } = state;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingDelete | null>(null);
  // Two error lines, because they belong to two surfaces: a rename that failed
  // in the list behind, and a delete that failed in the warning on top.
  const [listError, setListError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reaching the board pane from inside this dialog can name a workspace whose
  // boards were never fetched — only the ones expanded in the menu have been.
  // This is the same lazy load the menu does; the expansion it also records is
  // inert while the menu is closed, and lands you back on the same workspace
  // when it next opens.
  useEffect(() => {
    if (target?.kind === 'boards') expandWorkspace(target.workspaceId);
  }, [target, expandWorkspace]);

  // A dialog reopened should not still be mid-rename from last time.
  useEffect(() => {
    if (target === null) {
      setEditingId(null);
      setPending(null);
      setListError(null);
      setDeleteError(null);
    }
  }, [target]);

  const startEditing = useCallback((id: string, name: string) => {
    setListError(null);
    setEditingId(id);
    setDraft(name);
  }, []);

  const submitRename = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmed = draft.trim();
      if (!editingId || !trimmed || state.busy) return;

      setListError(null);
      state.renameWorkspace(editingId, trimmed).then(
        () => setEditingId(null),
        // Left open with the typed name in it, so it can be corrected rather
        // than typed again.
        (err: unknown) =>
          setListError(err instanceof Error ? err.message : 'Something went wrong.'),
      );
    },
    [draft, editingId, state],
  );

  const askToDelete = useCallback((next: PendingDelete) => {
    setDeleteError(null);
    setPending(next);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!pending) return;

    setDeleteError(null);
    const done =
      pending.kind === 'workspace'
        ? state.deleteWorkspace(pending.workspace.id)
        : state.deleteBoard(pending.board.id);

    done.then(
      () => setPending(null),
      (err: unknown) =>
        setDeleteError(err instanceof Error ? err.message : 'Something went wrong.'),
    );
  }, [pending, state]);

  const workspaces = state.workspaces ?? [];
  const openWorkspace =
    target?.kind === 'boards'
      ? workspaces.find((workspace) => workspace.id === target.workspaceId)
      : undefined;

  return (
    <>
      <SurfaceDialog
        open={target !== null}
        theme={theme}
        title={target?.kind === 'boards' ? (openWorkspace?.name ?? 'Boards') : 'Workspaces'}
        subtitle={
          target?.kind === 'boards'
            ? 'Rename or delete the boards in this workspace'
            : 'Rename or delete the workspaces you belong to'
        }
        leading={
          target?.kind === 'boards' && openWorkspace ? (
            <InitialBadge
              label={openWorkspace.name}
              src={openWorkspace.logoUrl}
              className="size-[42px] rounded-full bg-[var(--surface-accent)] text-[13px] text-[var(--surface-on-accent)]"
            />
          ) : (
            <span className="flex size-[42px] items-center justify-center rounded-full bg-[var(--surface-accent)] text-[var(--surface-on-accent)]">
              <Settings2 className="size-[18px]" aria-hidden="true" />
            </span>
          )
        }
        width={560}
        onClose={endManage}
        footer={
          <>
            <div className="flex-1" />
            <SurfaceButton variant="primary" onClick={endManage}>
              Done
            </SurfaceButton>
          </>
        }
      >
        {target?.kind === 'boards' && (
          <button
            type="button"
            className="flex w-fit items-center gap-[4px] rounded-[6px] text-[12px] text-[var(--surface-fg-muted)] transition-colors outline-hidden hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
            onClick={() => beginManage({ kind: 'workspaces' })}
          >
            <ChevronLeft className="size-[14px]" aria-hidden="true" />
            All workspaces
          </button>
        )}

        <SurfaceCard className="no-scrollbar max-h-[316px] overflow-y-auto">
          {target?.kind === 'boards' ? (
            <BoardList
              state={state}
              workspaceId={target.workspaceId}
              onDelete={(board) => askToDelete({ kind: 'board', board })}
            />
          ) : (
            <WorkspaceList
              workspaces={workspaces}
              busy={state.busy}
              editingId={editingId}
              draft={draft}
              onDraftChange={setDraft}
              onStartEditing={startEditing}
              onCancelEditing={() => setEditingId(null)}
              onSubmit={submitRename}
              onOpenBoards={(workspaceId) => beginManage({ kind: 'boards', workspaceId })}
              onDelete={(workspace) => askToDelete({ kind: 'workspace', workspace })}
            />
          )}
        </SurfaceCard>

        {listError && <SurfaceHint tone="danger">{listError}</SurfaceHint>}
      </SurfaceDialog>

      <DeleteWarningDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        theme={theme}
        busy={state.busy}
        error={deleteError}
        onConfirm={confirmDelete}
        title={
          pending?.kind === 'workspace'
            ? `Delete “${pending.workspace.name}”?`
            : `Delete “${pending?.board.title ?? 'this board'}”?`
        }
        // Only the workspace asks for its name to be typed: it is the delete
        // that takes other things with it.
        confirmText={pending?.kind === 'workspace' ? pending.workspace.name : undefined}
        confirmLabel={pending?.kind === 'workspace' ? 'Delete workspace' : 'Delete board'}
        description={
          pending?.kind === 'workspace' ? (
            <>
              This deletes the workspace and{' '}
              <strong>{boardCountPhrase(pending.workspace.boardCount)}</strong> in it. Everyone in
              the workspace loses access, and anyone with one of its boards open is disconnected.
              You can’t undo this here.
            </>
          ) : (
            <>
              This deletes the board for everyone who can reach it, and disconnects anyone who has
              it open. You can’t undo this here.
            </>
          )
        }
      />
    </>
  );
}

interface WorkspaceListProps {
  workspaces: WorkspaceSummary[];
  busy: boolean;
  editingId: string | null;
  draft: string;
  onDraftChange: (name: string) => void;
  onStartEditing: (id: string, name: string) => void;
  onCancelEditing: () => void;
  onSubmit: (event: FormEvent) => void;
  onOpenBoards: (workspaceId: string) => void;
  onDelete: (workspace: WorkspaceSummary) => void;
}

function WorkspaceList({
  workspaces,
  busy,
  editingId,
  draft,
  onDraftChange,
  onStartEditing,
  onCancelEditing,
  onSubmit,
  onOpenBoards,
  onDelete,
}: WorkspaceListProps) {
  if (workspaces.length === 0) {
    return (
      <p className="px-[18px] py-[14px] text-[12px] text-[var(--surface-fg-muted)]">
        No workspaces yet.
      </p>
    );
  }

  return (
    <>
      {workspaces.map((workspace) => {
        // Mirrors the routes: an admin may rename, only the owner may delete.
        // The server is what actually enforces both.
        const canRename = workspace.role === 'owner' || workspace.role === 'admin';
        const canDelete = workspace.role === 'owner';

        if (editingId === workspace.id) {
          return (
            <form key={workspace.id} className={rowClasses} onSubmit={onSubmit}>
              <InitialBadge
                label={workspace.name}
                src={workspace.logoUrl}
                className="size-[30px] shrink-0 rounded-[7px] bg-[var(--surface-accent)] text-[10px] text-[var(--surface-on-accent)]"
              />
              <Input
                value={draft}
                maxLength={MAX_WORKSPACE_NAME}
                aria-label="Workspace name"
                // It replaced the row that was just clicked, and is the only
                // thing in the form to reach for.
                autoFocus
                onChange={(event) => onDraftChange(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    // Back to the row, without taking the dialog down with it.
                    event.stopPropagation();
                    onCancelEditing();
                  }
                }}
                className={cn(SURFACE_INPUT_CLASS, 'h-[32px] min-w-0 flex-1')}
              />
              <SurfaceButton variant="primary" type="submit" disabled={busy || !draft.trim()}>
                Save
              </SurfaceButton>
              <SurfaceButton variant="ghost" onClick={onCancelEditing}>
                Cancel
              </SurfaceButton>
            </form>
          );
        }

        return (
          <div key={workspace.id} className={rowClasses}>
            <InitialBadge
              label={workspace.name}
              src={workspace.logoUrl}
              className="size-[30px] shrink-0 rounded-[7px] bg-[var(--surface-accent)] text-[10px] text-[var(--surface-on-accent)]"
            />
            {/* The name is the way into this workspace's boards, so the row
                stays one target rather than growing a third small button. */}
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-start rounded-[4px] text-left outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
              onClick={() => onOpenBoards(workspace.id)}
            >
              <span className="w-full truncate text-[12.5px] font-medium text-[var(--surface-fg)]">
                {workspace.name}
              </span>
              <span className="text-[11px] text-[var(--surface-fg-faint)]">
                {boardCountPhrase(workspace.boardCount)} · {workspace.role}
              </span>
            </button>
            <ChevronRight
              className="size-[14px] shrink-0 text-[var(--surface-fg-faint)]"
              aria-hidden="true"
            />
            <RowActions>
              <RowAction
                icon={<Pencil className="size-3.5" aria-hidden="true" />}
                label={`Rename ${workspace.name}`}
                hidden={!canRename}
                onClick={() => onStartEditing(workspace.id, workspace.name)}
              />
              <RowAction
                destructive
                icon={<Trash2 className="size-3.5" aria-hidden="true" />}
                label={`Delete ${workspace.name}`}
                hidden={!canDelete}
                onClick={() => onDelete(workspace)}
              />
            </RowActions>
          </div>
        );
      })}
    </>
  );
}

interface BoardListProps {
  state: BoardSwitcherState;
  workspaceId: string;
  onDelete: (board: BoardSummary) => void;
}

function BoardList({ state, workspaceId, onDelete }: BoardListProps) {
  const entry = state.boardsFor(workspaceId);

  if (entry === undefined || entry.status === 'loading') {
    return (
      <p className="px-[18px] py-[14px] text-[12px] text-[var(--surface-fg-muted)]">
        Loading boards…
      </p>
    );
  }

  if (entry.status === 'error') {
    return (
      <p role="alert" className="px-[18px] py-[14px] text-[12px] text-[var(--surface-danger)]">
        {entry.error}
      </p>
    );
  }

  if (entry.boards.length === 0) {
    return (
      <p className="px-[18px] py-[14px] text-[12px] text-[var(--surface-fg-muted)]">
        No boards yet.
      </p>
    );
  }

  return (
    <>
      {entry.boards.map((board) => (
        <div key={board.id} className={rowClasses}>
          <ColorDot color={board.color} />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--surface-fg)]">
            {board.title}
            {board.id === state.boardId && (
              <span className="ml-2 text-[11px] text-[var(--surface-fg-faint)]">Open</span>
            )}
          </span>
          <span className="shrink-0 text-[11px] text-[var(--surface-fg-faint)]">
            {formatUpdatedAt(board.updatedAt)}
          </span>
          {/* Renaming a board also tags it with a colour, which needs more room
              than a row can give — so it hands off to the dialog built for it,
              and this one closes rather than stacking behind it. */}
          <RowActions>
            <RowAction
              icon={<Pencil className="size-3.5" aria-hidden="true" />}
              label={`Rename ${board.title}`}
              onClick={() => {
                state.endManage();
                state.beginRename(board.id);
              }}
            />
            <RowAction
              destructive
              icon={<Trash2 className="size-3.5" aria-hidden="true" />}
              label={`Delete ${board.title}`}
              onClick={() => onDelete(board)}
            />
          </RowActions>
        </div>
      ))}
    </>
  );
}

/** A row inside the list card — the settings pane's spacing, not the menu's. */
const rowClasses =
  'flex w-full items-center gap-[12px] px-[18px] py-[12px] transition-colors hover:bg-[var(--surface-nav-hover)]';

interface RowActionProps {
  icon: React.ReactNode;
  /** The accessible name; the icon alone carries no meaning. */
  label: string;
  destructive?: boolean;
  /** Renders a spacer instead, so rows with fewer actions stay aligned. */
  hidden?: boolean;
  onClick: () => void;
}

/**
 * One of the small controls at the end of a row.
 *
 * Always on screen rather than revealed by hovering the row. A control you
 * cannot see is one you have to go looking for, and on a touch screen there is
 * no hover to find it with at all — so these stay quiet in the faint colour and
 * come forward on hover instead of appearing from nothing.
 *
 * A person who may not use one gets an empty space of the same size rather
 * than a disabled button: there is nothing here for them to enable.
 */
function RowAction({ icon, label, destructive = false, hidden = false, onClick }: RowActionProps) {
  if (hidden) return <span className="size-[26px] shrink-0" aria-hidden="true" />;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-[26px] shrink-0 items-center justify-center rounded-[6px] text-[var(--surface-fg-faint)] outline-hidden transition-colors',
        'focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]',
        destructive
          ? 'hover:bg-[var(--surface-danger-wash)] hover:text-[var(--surface-danger)]'
          : 'hover:bg-[var(--surface-nav-active)] hover:text-[var(--surface-fg)]',
      )}
    >
      {icon}
    </button>
  );
}

/**
 * The controls at the end of a row, as one group.
 *
 * Their own gap, not the row's: the row spaces unrelated things generously,
 * and two icons that do related things to the same row should read as a pair
 * rather than as two separate destinations.
 */
function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 items-center gap-[2px]">{children}</div>;
}

/** "1 board" / "4 boards", so the count reads as a phrase wherever it lands. */
function boardCountPhrase(count: number): string {
  return count === 1 ? '1 board' : `${count} boards`;
}
