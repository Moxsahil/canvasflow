import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuDangerRowClasses } from '@/components/ui/menu-look';
import { InitialBadge } from '@/components/ui/initial-badge';
import {
  InlineDropdownMenu,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import { PLAN_NAMES, type WorkspacePlan } from '@canvasflow/types';
import { cachedBilling, loadBilling } from '../billing/billing-cache';
import { formatDay } from '../billing/format';
import { rich, useT } from '../i18n';
import { INPUT, SCROLLBAR, SLIDE } from '../settings/settings-ui';
import {
  SurfaceWindow,
  WindowButton,
  WindowFooter,
  WindowHeader,
  useWindowContainer,
} from '../ui/SurfaceWindow';
import type { SurfaceTheme } from '../ui/surface-palette';
import { ColorDot, formatUpdatedAt } from './board-presentation';
import { DeleteWarningDialog } from './DeleteWarningDialog';
import { PlanBlocksDeleteDialog, type PlanBlock } from './PlanBlocksDeleteDialog';
import { ROLE_KEYS, YOU_ARE_KEYS } from './role-words';
import { liveBoards, type BoardSwitcherState } from './useBoardSwitcher';
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
  /** Opens Settings at Billing on a workspace, for a delete that waits on its plan. */
  onOpenBilling?: (workspaceId: string) => void;
}

/**
 * Managing what already exists: renaming workspaces and boards, and deleting
 * either.
 *
 * The switcher's two panels are where you *go* somewhere — pick a workspace,
 * open a board — and adding to them is a single row in each footer. Changing
 * or removing something is a different errand, so it lives here, one window
 * reached from either panel, showing whichever list you asked for: the
 * workspaces, or one workspace's boards, which slide in from the right.
 *
 * Each row keeps what it can do behind a ⋯ menu in the app's menu look. A
 * workspace is renamed in place; a board is renamed, and anything is deleted,
 * in a window that opens on top of this one.
 *
 * Nothing here decides what a person may do; it only declines to offer what
 * the server would refuse. The rules themselves live in the routes.
 */
export function ManageDialog({ state, theme, onOpenBilling }: ManageDialogProps) {
  const t = useT();
  const target = state.manageTarget;
  const { loadWorkspaceBoards, endManage, beginManage } = state;
  const titleId = useId();

  // What the window shows: kept while it sinks away on close, so its contents
  // don't change under the fade.
  const lastTarget = useRef(target);
  if (target) lastTarget.current = target;
  const shown = target ?? lastTarget.current;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingDelete | null>(null);
  // The warning's words, kept while it sinks away like the window's own.
  const lastPending = useRef(pending);
  if (pending) lastPending.current = pending;
  const asking = pending ?? lastPending.current;
  // Two error lines, because they belong to two windows: a rename that failed
  // in the list, and a delete that failed in the warning on top.
  const [listError, setListError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // A workspace whose plan still renews: cancelled first, then deleted.
  const [planBlock, setPlanBlock] = useState<PlanBlock | null>(null);
  // Its plan, when cancelled but still running: the warning says it ends too.
  const [endingPlan, setEndingPlan] = useState<WorkspacePlan | null>(null);

  // Reaching the board pane from inside this dialog can name a workspace whose
  // boards were never fetched — only the ones the sidebar has listed have been.
  // Fetched without listing it, so the sidebar stays on the workspace it shows.
  useEffect(() => {
    if (target?.kind === 'boards') loadWorkspaceBoards(target.workspaceId);
  }, [target, loadWorkspaceBoards]);

  // A dialog reopened should not still be mid-rename from last time.
  useEffect(() => {
    if (target === null) {
      setEditingId(null);
      setPending(null);
      setListError(null);
      setDeleteError(null);
      setPlanBlock(null);
    }
  }, [target]);

  // Which way the list slides: in from the right going into a workspace, and
  // back from the left coming out of one.
  const view = shown?.kind ?? 'workspaces';
  const lastView = useRef(view);
  const direction = view === lastView.current ? 0 : view === 'boards' ? 1 : -1;
  useEffect(() => {
    lastView.current = view;
  }, [view]);

  const startEditing = useCallback((id: string, name: string) => {
    setListError(null);
    setEditingId(id);
    setDraft(name);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setListError(null);
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
          setListError(err instanceof Error ? err.message : t('common.somethingWentWrong')),
      );
    },
    [draft, editingId, state, t],
  );

  const askToDelete = useCallback((next: PendingDelete) => {
    setDeleteError(null);
    setEndingPlan(null);
    if (next.kind !== 'workspace' || next.workspace.plan === 'free') {
      setPending(next);
      return;
    }
    const { workspace } = next;
    // Read from what Settings keeps, or asked now. If it can't be read the
    // warning opens as usual, and the server refuses a plan still renewing.
    const kept = cachedBilling(workspace.id);
    void (kept ? Promise.resolve(kept) : loadBilling(workspace.id)).then(
      ({ billing }) => {
        const sub = billing.subscription;
        if (sub && !sub.cancelAtPeriodEnd) {
          setPlanBlock({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            plan: billing.plan,
            renewsOn: sub.renewsAt ? formatDay(new Date(sub.renewsAt)) : null,
          });
          return;
        }
        if (sub) setEndingPlan(billing.plan);
        setPending(next);
      },
      () => setPending(next),
    );
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
        setDeleteError(err instanceof Error ? err.message : t('common.somethingWentWrong')),
    );
  }, [pending, state, t]);

  const workspaces = state.workspaces ?? [];
  const openWorkspace =
    shown?.kind === 'boards'
      ? workspaces.find((workspace) => workspace.id === shown.workspaceId)
      : undefined;

  // The quiet line in the foot says what you may do here, until something
  // goes wrong and it says that instead.
  let footLine: string;
  if (shown?.kind === 'boards') {
    const entry = liveBoards(state.boardsFor(shown.workspaceId));
    const count = entry?.status === 'ready' ? entry.boards.length : openWorkspace?.boardCount;
    footLine = [
      count === undefined ? null : t('boards.count', { count }),
      openWorkspace && t(YOU_ARE_KEYS[openWorkspace.role]),
    ]
      .filter(Boolean)
      .join(' · ');
  } else {
    footLine = t('manage.onlyOwnerDeletes');
  }

  return (
    <>
      <SurfaceWindow
        open={target !== null}
        theme={theme}
        onClose={endManage}
        width={520}
        labelledBy={titleId}
        // Escape leaves a rename in progress before it closes the window.
        onEscape={() => {
          if (editingId === null) return false;
          cancelEditing();
          return true;
        }}
        data-testid="manage-dialog"
      >
        <WindowHeader
          titleId={titleId}
          title={
            shown?.kind === 'boards'
              ? (openWorkspace?.name ?? t('boards.title'))
              : t('manage.workspaces')
          }
          description={
            shown?.kind === 'boards' ? t('manage.boardsHint') : t('manage.workspacesHint')
          }
          lead={
            shown?.kind === 'boards' && openWorkspace ? (
              <InitialBadge
                label={openWorkspace.name}
                src={openWorkspace.logoUrl}
                className="size-[36px] rounded-full bg-[var(--surface-accent)] text-[12px] text-[var(--surface-on-accent)]"
              />
            ) : undefined
          }
          onClose={endManage}
        />

        <div className="flex min-h-0 flex-col overflow-hidden px-[20px] pt-[12px]">
          <motion.div
            key={shown?.kind === 'boards' ? `boards-${shown.workspaceId}` : 'workspaces'}
            custom={direction}
            variants={SLIDE}
            initial={direction === 0 ? false : 'enter'}
            animate="center"
            className="flex min-h-0 flex-col gap-[4px]"
          >
            {shown?.kind === 'boards' && (
              <button
                type="button"
                className="-ml-[4px] flex w-fit items-center gap-[2px] rounded-[6px] py-[3px] pr-[8px] pl-[2px] text-[12px] font-medium text-[var(--surface-fg-muted)] transition-colors outline-hidden hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
                onClick={() => {
                  setEditingId(null);
                  beginManage({ kind: 'workspaces' });
                }}
              >
                <ChevronLeft className="size-[14px]" aria-hidden="true" />
                {t('manage.allWorkspaces')}
              </button>
            )}

            <div className={cn('flex max-h-[262px] min-h-0 flex-col overflow-y-auto', SCROLLBAR)}>
              {shown?.kind === 'boards' ? (
                <BoardList
                  state={state}
                  workspaceId={shown.workspaceId}
                  onRename={(board) => state.beginRename(board.id)}
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
                  onCancelEditing={cancelEditing}
                  onSubmit={submitRename}
                  onOpenBoards={(workspaceId) => {
                    setEditingId(null);
                    beginManage({ kind: 'boards', workspaceId });
                  }}
                  onDelete={(workspace) => askToDelete({ kind: 'workspace', workspace })}
                />
              )}
            </div>
          </motion.div>
        </div>

        <WindowFooter status={listError ?? footLine} danger={listError !== null}>
          <WindowButton variant="primary" onClick={endManage}>
            {t('common.done')}
          </WindowButton>
        </WindowFooter>
      </SurfaceWindow>

      <PlanBlocksDeleteDialog
        block={planBlock}
        theme={theme}
        onClose={() => setPlanBlock(null)}
        onOpenBilling={
          onOpenBilling &&
          ((workspaceId) => {
            setPlanBlock(null);
            endManage();
            onOpenBilling(workspaceId);
          })
        }
      />
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
          asking?.kind === 'workspace'
            ? t('boards.deleteTitle', { title: asking.workspace.name })
            : t('boards.deleteTitle', { title: asking?.board.title ?? t('boards.thisBoard') })
        }
        // Only the workspace asks for its name to be typed: it is the delete
        // that takes other things with it.
        confirmText={asking?.kind === 'workspace' ? asking.workspace.name : undefined}
        confirmLabel={
          asking?.kind === 'workspace' ? t('manage.deleteWorkspace') : t('boards.deleteConfirm')
        }
        description={
          asking?.kind === 'workspace' ? (
            <>
              {rich(t('manage.deleteWorkspaceWarning'), {
                boards: (
                  <strong>{t('boards.count', { count: asking.workspace.boardCount })}</strong>
                ),
              })}
              {endingPlan && ` ${t('manage.planEndsWith', { plan: PLAN_NAMES[endingPlan] })}`}
            </>
          ) : (
            t('boards.deleteWarning')
          )
        }
      />
    </>
  );
}

/** A row of either list: split from the next by a hairline, not boxed. */
const ROW =
  'flex min-h-[52px] w-full shrink-0 items-center gap-[12px] border-t border-[var(--surface-line)] first:border-t-0';

/** The small square buttons at the end of a row. */
const ICON_BUTTON =
  'flex size-[28px] shrink-0 items-center justify-center rounded-[7px] text-[var(--surface-fg-muted)] outline-hidden transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] data-[state=open]:bg-[var(--surface-wash)] data-[state=open]:text-[var(--surface-fg)]';

/** A line in place of a list: loading, empty, or failed. */
function ListNote({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <p
      role={error ? 'alert' : undefined}
      className={cn(
        'py-[14px] text-[12px]',
        error ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-fg-muted)]',
      )}
    >
      {children}
    </p>
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
  const t = useT();
  if (workspaces.length === 0) return <ListNote>{t('manage.noWorkspaces')}</ListNote>;

  return (
    <>
      {workspaces.map((workspace) => {
        // Mirrors the routes: an admin may rename, only the owner may delete.
        // The server is what actually enforces both.
        const canRename = workspace.role === 'owner' || workspace.role === 'admin';
        const canDelete = workspace.role === 'owner';
        const badge = (
          <InitialBadge
            label={workspace.name}
            src={workspace.logoUrl}
            className="size-[30px] shrink-0 rounded-full bg-[var(--surface-accent)] text-[11px] text-[var(--surface-on-accent)]"
          />
        );

        if (editingId === workspace.id) {
          return (
            <form key={workspace.id} className={ROW} onSubmit={onSubmit}>
              {badge}
              <div className="flex min-w-0 flex-1 gap-[6px]">
                <input
                  value={draft}
                  maxLength={MAX_WORKSPACE_NAME}
                  aria-label={t('workspace.name')}
                  // It replaced the row that was just chosen, and is the only
                  // thing in the form to reach for.
                  ref={focusOnceShown}
                  onChange={(event) => onDraftChange(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  className={cn(INPUT, 'min-w-0 flex-1')}
                />
                <WindowButton variant="ghost" onClick={onCancelEditing}>
                  {t('common.cancel')}
                </WindowButton>
                <WindowButton variant="primary" type="submit" disabled={busy || !draft.trim()}>
                  {t('common.save')}
                </WindowButton>
              </div>
            </form>
          );
        }

        return (
          <div key={workspace.id} className={ROW}>
            {badge}
            {/* The name is the way into this workspace's boards. */}
            <button
              type="button"
              className="grid min-w-0 flex-1 gap-[1px] rounded-[6px] py-[2px] text-left outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
              onClick={() => onOpenBoards(workspace.id)}
            >
              <span className="truncate text-[12.5px] font-medium text-[var(--surface-fg)]">
                {workspace.name}
              </span>
              <span className="text-[11.5px] text-[var(--surface-fg-muted)]">
                {`${t('boards.count', { count: workspace.boardCount })} · ${t(ROLE_KEYS[workspace.role])}`}
              </span>
            </button>
            <RowMenu label={t('manage.moreFor', { name: workspace.name })}>
              <InlineDropdownMenuItem
                icon={<ChevronRight aria-hidden="true" />}
                onSelect={() => onOpenBoards(workspace.id)}
              >
                {t('manage.openBoards')}
              </InlineDropdownMenuItem>
              <InlineDropdownMenuItem
                icon={<Pencil aria-hidden="true" />}
                disabled={!canRename}
                onSelect={() => onStartEditing(workspace.id, workspace.name)}
              >
                {t('common.renameEllipsis')}
              </InlineDropdownMenuItem>
              <InlineDropdownMenuSeparator />
              {/* Shown but dimmed for anyone but the owner, and the foot says
                  why: a Delete that is missing is one you go looking for. */}
              <InlineDropdownMenuItem
                icon={<Trash2 aria-hidden="true" />}
                disabled={!canDelete}
                onSelect={() => onDelete(workspace)}
                className={menuDangerRowClasses}
              >
                {t('common.deleteEllipsis')}
              </InlineDropdownMenuItem>
            </RowMenu>
            <button
              type="button"
              aria-label={t('manage.boardsIn', { name: workspace.name })}
              className={ICON_BUTTON}
              onClick={() => onOpenBoards(workspace.id)}
            >
              <ChevronRight className="size-[14px]" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </>
  );
}

interface BoardListProps {
  state: BoardSwitcherState;
  workspaceId: string;
  onRename: (board: BoardSummary) => void;
  onDelete: (board: BoardSummary) => void;
}

function BoardList({ state, workspaceId, onRename, onDelete }: BoardListProps) {
  const t = useT();
  // Archived boards are read-only until brought back, from the sidebar's
  // Archived list; there is nothing to rename here.
  const entry = liveBoards(state.boardsFor(workspaceId));

  if (entry === undefined || entry.status === 'loading')
    return <ListNote>{t('manage.loadingBoards')}</ListNote>;
  if (entry.status === 'error') return <ListNote error>{entry.error}</ListNote>;
  if (entry.boards.length === 0) return <ListNote>{t('boards.none')}</ListNote>;

  return (
    <>
      {entry.boards.map((board) => (
        <div key={board.id} className={ROW}>
          <ColorDot color={board.color} className="mx-[4px] size-[9px]" />
          <div className="grid min-w-0 flex-1 gap-[1px]">
            <span className="flex min-w-0 items-center gap-[6px] text-[12.5px] font-medium text-[var(--surface-fg)]">
              <span className="truncate">{board.title}</span>
              {board.id === state.boardId && (
                <span className="inline-flex h-[20px] shrink-0 items-center rounded-full bg-[var(--surface-wash)] px-[7px] text-[10.5px] font-medium text-[var(--surface-fg-muted)]">
                  {t('manage.openNow')}
                </span>
              )}
            </span>
            <span className="text-[11.5px] text-[var(--surface-fg-muted)]">
              {t('board.edited', { when: formatUpdatedAt(board.updatedAt) })}
            </span>
          </div>
          {/* Renaming a board also tags it with a colour, so it opens its own
              window on top of this one, and comes back here when done. */}
          <RowMenu label={t('manage.moreFor', { name: board.title })}>
            <InlineDropdownMenuItem
              icon={<Pencil aria-hidden="true" />}
              onSelect={() => onRename(board)}
            >
              {t('common.renameEllipsis')}
            </InlineDropdownMenuItem>
            <InlineDropdownMenuSeparator />
            <InlineDropdownMenuItem
              icon={<Trash2 aria-hidden="true" />}
              onSelect={() => onDelete(board)}
              className={menuDangerRowClasses}
            >
              {t('common.deleteEllipsis')}
            </InlineDropdownMenuItem>
          </RowMenu>
        </div>
      ))}
    </>
  );
}

/** A row's ⋯ menu, in the menu look the context menu and the sidebar use. */
function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const container = useWindowContainer();
  return (
    <InlineDropdownMenu>
      <InlineDropdownMenuTrigger asChild>
        <button type="button" aria-label={label} className={ICON_BUTTON}>
          <Ellipsis className="size-[16px]" aria-hidden="true" />
        </button>
      </InlineDropdownMenuTrigger>
      <InlineDropdownMenuContent
        align="end"
        sideOffset={4}
        collisionPadding={8}
        // Back to the ⋯ button on close — unless what was chosen has put
        // focus somewhere of its own, such as a rename field or a window.
        onCloseAutoFocus={(event) => {
          const active = document.activeElement;
          if (active && active !== document.body && !active.closest('[role="menu"]')) {
            event.preventDefault();
          }
        }}
        container={container}
        className="min-w-44"
      >
        {children}
      </InlineDropdownMenuContent>
    </InlineDropdownMenu>
  );
}

/**
 * Focuses a field on the frame after it appears. Chosen from a menu, it would
 * lose focus straight back to the menu, which holds on to it until it closes.
 */
function focusOnceShown(input: HTMLInputElement | null) {
  if (input) requestAnimationFrame(() => input.focus());
}
