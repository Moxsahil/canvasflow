import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Settings2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { InitialBadge } from '@/components/ui/initial-badge';
import { Input } from '@/components/ui/input';
import { ColorDot, formatUpdatedAt } from './board-presentation';
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
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  portalContainer: HTMLElement | null;
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
 * Built as the rename and share dialogs are — a Card carried by a Dialog
 * stripped to nothing — so the three read as one application.
 *
 * Nothing here decides what a person may do; it only declines to offer what
 * the server would refuse. The rules themselves live in the routes.
 */
export function ManageDialog({ state, portalContainer }: ManageDialogProps) {
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
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) endManage();
        }}
      >
        <DialogContent
          container={portalContainer}
          showClose={false}
          aria-describedby={undefined}
          className="w-[min(100%-2rem,34rem)] border-0 bg-transparent p-0 shadow-none"
        >
          <DialogTitle className="sr-only">
            {target?.kind === 'boards' ? 'Manage boards' : 'Manage workspaces'}
          </DialogTitle>

          <Card className="w-full">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  {target?.kind === 'boards' && openWorkspace ? (
                    <InitialBadge
                      label={openWorkspace.name}
                      src={openWorkspace.logoUrl}
                      className="size-12 rounded-full bg-primary text-sm text-primary-foreground"
                    />
                  ) : (
                    <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Settings2 className="size-5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-lg font-semibold">
                    {target?.kind === 'boards' ? (openWorkspace?.name ?? 'Boards') : 'Workspaces'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {target?.kind === 'boards'
                      ? 'Rename or delete the boards in this workspace'
                      : 'Rename or delete the workspaces you belong to'}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              {target?.kind === 'boards' && (
                <button
                  type="button"
                  className="flex w-fit items-center gap-1 rounded-md text-sm text-muted-foreground outline-hidden transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => beginManage({ kind: 'workspaces' })}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  All workspaces
                </button>
              )}

              <div className="-mx-1 flex max-h-80 flex-col gap-1 overflow-y-auto px-1">
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
              </div>

              {listError && (
                <p role="alert" className="text-sm text-destructive">
                  {listError}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="button" variant="ghost" onClick={endManage}>
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      <DeleteWarningDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        container={portalContainer}
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
    return <p className="py-2 text-sm text-muted-foreground">No workspaces yet.</p>;
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
                className="size-8 rounded-md bg-primary text-[0.625rem] text-primary-foreground"
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
                className="h-8 min-w-0 flex-1"
              />
              <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onCancelEditing}>
                Cancel
              </Button>
            </form>
          );
        }

        return (
          <div key={workspace.id} className={cn(rowClasses, 'group/row')}>
            <InitialBadge
              label={workspace.name}
              src={workspace.logoUrl}
              className="size-8 rounded-md bg-primary text-[0.625rem] text-primary-foreground"
            />
            {/* The name is the way into this workspace's boards, so the row
                stays one target rather than growing a third small button. */}
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-start rounded-sm text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpenBoards(workspace.id)}
            >
              <span className="w-full truncate text-sm font-medium">{workspace.name}</span>
              <span className="text-xs text-muted-foreground">
                {boardCountPhrase(workspace.boardCount)} · {workspace.role}
              </span>
            </button>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
    return <p className="py-2 text-sm text-muted-foreground">Loading boards…</p>;
  }

  if (entry.status === 'error') {
    return (
      <p role="alert" className="py-2 text-sm text-destructive">
        {entry.error}
      </p>
    );
  }

  if (entry.boards.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">No boards yet.</p>;
  }

  return (
    <>
      {entry.boards.map((board) => (
        <div key={board.id} className={cn(rowClasses, 'group/row')}>
          <ColorDot color={board.color} />
          <span className="min-w-0 flex-1 truncate text-sm">
            {board.title}
            {board.id === state.boardId && (
              <span className="ml-2 text-xs text-muted-foreground">Open</span>
            )}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatUpdatedAt(board.updatedAt)}
          </span>
          {/* Renaming a board also tags it with a colour, which needs more room
              than a row can give — so it hands off to the dialog built for it,
              and this one closes rather than stacking behind it. */}
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
        </div>
      ))}
    </>
  );
}

const rowClasses =
  'flex items-center gap-2 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-accent/50';

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
 * Revealed by hovering the row, and by focus for a keyboard, so a list of
 * things to read doesn't present as a list of things to press. A person who
 * may not use one gets an empty space of the same size rather than a disabled
 * button — there is nothing here for them to enable.
 */
function RowAction({ icon, label, destructive = false, hidden = false, onClick }: RowActionProps) {
  if (hidden) return <span className="size-7 shrink-0" aria-hidden="true" />;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-hidden transition-opacity',
        'focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100',
        destructive ? 'hover:text-destructive' : 'hover:text-foreground',
      )}
    >
      {icon}
    </button>
  );
}

/** "1 board" / "4 boards", so the count reads as a phrase wherever it lands. */
function boardCountPhrase(count: number): string {
  return count === 1 ? '1 board' : `${count} boards`;
}
