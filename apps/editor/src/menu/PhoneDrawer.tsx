import { Fragment, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Shape } from '@canvasflow/canvas-engine';
import { PLAN_NAMES, PLAN_PRICES, formatPlanPrice, type WorkspacePlan } from '@canvasflow/types';
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleArrowUp,
  Ellipsis,
  FileText,
  Globe,
  Info,
  LibraryBig,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { InitialBadge } from '@/components/ui/initial-badge';
import { useSidebar } from '@/components/ui/sidebar';
import { env } from '../lib/env';
import { listedLanguages, useI18n, useT, type TranslationKey } from '../i18n';
import { libraryThumbnail } from '../library/library-items';
import { PREFERENCE_GROUPS } from '../preferences/preferences';
import type { PreferencesState } from '../preferences/usePreferences';
import type { ThemePreference } from '../theme';
import type { SurfaceTheme } from '../ui/surface-palette';
import { SHARED_WITH_YOU, type BoardSwitcherState } from '../workspace';
import { DeleteWarningDialog } from '../workspace/DeleteWarningDialog';
import { SharedBadge } from '../workspace/WorkspaceSwitcher';
import { ColorDot, formatUpdatedAt } from '../workspace/board-presentation';
import { pinnedOf } from '../workspace/useBoardSwitcher';
import type { BoardSummary } from '../workspace/workspace-api';
import {
  BOARD_MENU_GROUPS,
  LEARN_MORE_GROUPS,
  MENU_ITEMS,
  liveAction,
  type MenuActions,
  type MenuItemId,
} from './menu-items';
import type { SidebarUser } from './NavUser';
import { PhoneSheet, RowSwitch, SheetGroup, SheetRow, SheetTile, SheetTiles } from './PhoneSheet';

type SheetState =
  | { kind: 'board' }
  | { kind: 'row'; board: BoardSummary }
  | { kind: 'workspace'; page?: 'create' }
  | { kind: 'account'; page?: 'language' | 'preferences' | 'learn' }
  | null;

interface PhoneDrawerProps {
  state: BoardSwitcherState;
  user: SidebarUser | null;
  actions?: MenuActions;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  preferences: PreferencesState;
  surfaceTheme: SurfaceTheme;
  portalContainer: HTMLElement | null;
  /** What the open board holds, for its thumbnail on the card. */
  boardShapes: readonly Shape[];
  /** Everyone on the open board right now, oneself included. */
  peopleHere: number;
  /** Opens the upgrade page for a workspace; without it there is no upgrade row. */
  onUpgrade?: (workspaceId: string) => void;
  /** The library's row, first under the workspace; without it there is none. */
  library?: PhoneDrawerLibrary;
}

export interface PhoneDrawerLibrary {
  /** Everything in it: one's own items and the packs. */
  count: number;
  open: () => void;
}

/** The plan one up from each, with what it adds, for the account sheet's upgrade row. */
const NEXT_PLAN: Partial<Record<WorkspacePlan, { plan: WorkspacePlan; hintKey: TranslationKey }>> =
  {
    free: { plan: 'pro', hintKey: 'drawer.upgrade.proHint' },
    pro: { plan: 'team', hintKey: 'drawer.upgrade.teamHint' },
  };

const THEMES: readonly { value: ThemePreference; labelKey: TranslationKey }[] = [
  { value: 'system', labelKey: 'theme.system' },
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
];

/** The four board actions worth a tile: the ones reached for most. */
const BOARD_TILES: readonly MenuItemId[] = [
  'liveCollaboration',
  'copyLink',
  'exportImage',
  'renameBoard',
];

/**
 * The sidebar on a phone: a drawer for getting around — the workspace, a
 * search, the open board, the pinned and the rest — and bottom sheets, in
 * thumb reach, for everything done to a board, a workspace or the account.
 *
 * The same items and actions as the desktop sidebar's menus; only where they
 * open is different.
 */
export function PhoneDrawer({
  state,
  user,
  actions,
  theme,
  onThemeChange,
  preferences,
  surfaceTheme,
  portalContainer,
  boardShapes,
  peopleHere,
  onUpgrade,
  library,
}: PhoneDrawerProps) {
  const t = useT();
  const { setOpenMobile } = useSidebar();
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [folded, setFolded] = useState<Record<string, boolean>>({ archived: true });
  const [pendingDelete, setPendingDelete] = useState<BoardSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeDrawer = useCallback(() => setOpenMobile(false), [setOpenMobile]);

  /** Runs a menu action, putting the sheet and the drawer away first. */
  const runAction = (id: MenuItemId) => {
    const action = liveAction(actions?.[id]);
    if (!action) return undefined;
    return () => {
      setSheet(null);
      closeDrawer();
      action();
    };
  };

  const listedId = state.listedId;
  const shared = listedId === SHARED_WITH_YOU;
  const workspace = state.workspaces?.find((it) => it.id === listedId) ?? null;
  const entry = listedId && !shared ? state.boardsFor(listedId) : undefined;
  const boards = useMemo(() => (entry?.status === 'ready' ? entry.boards : []), [entry]);
  const needle = query.trim().toLowerCase();
  const matches = (board: { title: string }) =>
    !needle || board.title.toLowerCase().includes(needle);
  const pinned = pinnedOf(boards).filter(matches);
  const listed = boards.filter((board) => !board.archivedAt && !board.pin && matches(board));
  const archived = boards.filter((board) => board.archivedAt && matches(board));
  const sharedBoards = (state.sharedBoards ?? []).filter(matches);
  const current = boards.find((board) => board.id === state.boardId);

  const thumbnail = useMemo(
    () => libraryThumbnail(boardShapes, surfaceTheme === 'dark'),
    [boardShapes, surfaceTheme],
  );

  const toggleFold = (id: string) => setFolded((was) => ({ ...was, [id]: !was[id] }));

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    state.deleteBoard(pendingDelete.id).then(
      () => setPendingDelete(null),
      (err: unknown) =>
        setDeleteError(err instanceof Error ? err.message : t('common.somethingWentWrong')),
    );
  };

  // --- the drawer -----------------------------------------------------------

  const workspaceName = shared ? t('boards.sharedWithYou') : (workspace?.name ?? state.title);
  const workspaceMeta = workspace
    ? `${PLAN_NAMES[workspace.plan]} · ${t('boards.count', { count: workspace.boardCount })}`
    : shared
      ? t('boards.count', { count: state.sharedBoards?.length ?? 0 })
      : null;

  const accountless = !user && (Boolean(actions?.yourBoards) || Boolean(actions?.signIn));
  const accountName = accountless
    ? t(actions?.yourBoards ? 'local.account.signedIn' : 'local.account.notSignedIn')
    : user?.name?.trim() || t('menu.account');
  const accountDetail = accountless
    ? t(actions?.yourBoards ? 'local.account.toBoards' : 'local.account.offer')
    : user?.username
      ? `@${user.username}`
      : (user?.email ?? '');
  const plan: WorkspacePlan | null = workspace?.plan ?? null;

  const boardRow = (board: BoardSummary) => {
    const here = board.id === state.boardId;
    return (
      <div
        key={board.id}
        className={cn('flex shrink-0 items-center rounded-[10px]', here && 'bg-sidebar-accent')}
      >
        <button
          type="button"
          onClick={() => {
            if (!here) state.openBoard(board.id);
            closeDrawer();
          }}
          aria-current={here ? 'page' : undefined}
          className={cn(
            'flex h-11 min-w-0 flex-1 items-center gap-[11px] rounded-[10px] pr-1 pl-2.5 text-left text-[14.5px] [&>svg]:size-[18px] [&>svg]:shrink-0',
            here
              ? 'font-medium text-sidebar-foreground [&>svg]:text-sidebar-foreground'
              : 'text-sidebar-foreground/85 [&>svg]:text-sidebar-foreground/55',
          )}
          data-testid={`drawer-board-${board.id}`}
        >
          {/* The board's colour tag, where the desktop list has it. */}
          <span className="grid size-[18px] shrink-0 place-items-center">
            <ColorDot color={board.color} />
          </span>
          <span className="min-w-0 flex-1 truncate">{board.title}</span>
        </button>
        {!shared && (
          <button
            type="button"
            onClick={() => setSheet({ kind: 'row', board })}
            aria-label={t('boards.moreActionsFor', { title: board.title })}
            className="grid size-9 shrink-0 place-items-center rounded-[9px] text-sidebar-foreground/50 active:bg-sidebar-foreground/10"
          >
            <Ellipsis className="size-[17px]" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

  const section = (id: string, label: string, list: readonly BoardSummary[]) => {
    if (list.length === 0) return null;
    const open = !folded[id] || needle !== '';
    return (
      <Fragment key={id}>
        <button
          type="button"
          onClick={() => toggleFold(id)}
          aria-expanded={open}
          className="flex w-full shrink-0 items-center gap-1 px-2 py-1.5 text-left text-xs font-medium text-sidebar-foreground/55"
        >
          {label}
          <ChevronDown
            className={cn('size-3.5 transition-transform', !open && '-rotate-90')}
            aria-hidden="true"
          />
          <span className="ml-auto font-mono text-[11px] text-sidebar-foreground/40">
            {list.length}
          </span>
        </button>
        {open && list.map((board) => boardRow(board))}
        <div className="h-3 shrink-0" />
      </Fragment>
    );
  };

  const nothingFound =
    needle !== '' &&
    pinned.length + listed.length + archived.length + (shared ? sharedBoards.length : 0) === 0;

  // --- the sheets ------------------------------------------------------------

  const chevron = <ChevronRight className="size-4" aria-hidden="true" />;
  const menuRow = (id: MenuItemId, danger = false, end?: ReactNode) => {
    const meta = MENU_ITEMS[id];
    const Icon = meta.icon;
    const run = runAction(id);
    // Left out where it is not offered, and where it is not built yet.
    if (actions?.[id] === false || actions?.[id] === undefined) return null;
    return (
      <SheetRow
        key={id}
        icon={Icon && <Icon aria-hidden="true" />}
        label={t(meta.labelKey)}
        onClick={run ?? (() => {})}
        disabled={!run}
        danger={danger || meta.destructive}
        end={end}
        testId={`drawer-item-${id}`}
      />
    );
  };

  let sheetBody: ReactNode = null;
  let sheetTitle = '';
  let sheetMeta: string | null = null;
  let sheetLead: ReactNode = null;
  let sheetBack: (() => void) | undefined;
  let sheetPage = '';

  if (sheet?.kind === 'board') {
    sheetTitle = state.title;
    sheetMeta = current ? t('board.edited', { when: formatUpdatedAt(current.updatedAt) }) : null;
    sheetLead = <Thumb src={thumbnail} small />;
    sheetPage = 'board';
    const rest = BOARD_MENU_GROUPS.map((group) =>
      group.filter(
        (id) => !BOARD_TILES.includes(id) && actions?.[id] !== undefined && actions[id] !== false,
      ),
    ).filter((group) => group.length > 0);
    sheetBody = (
      <>
        <SheetTiles>
          {BOARD_TILES.map((id, index) => {
            const meta = MENU_ITEMS[id];
            const Icon = meta.icon;
            return (
              <SheetTile
                key={id}
                primary={index === 0}
                icon={Icon && <Icon aria-hidden="true" />}
                label={t(TILE_LABELS[id] ?? meta.labelKey)}
                onClick={runAction(id)}
              />
            );
          })}
        </SheetTiles>
        {rest.map((group, index) => (
          <SheetGroup key={index}>{group.map((id) => menuRow(id))}</SheetGroup>
        ))}
      </>
    );
  } else if (sheet?.kind === 'row') {
    const board = sheet.board;
    const here = board.id === state.boardId;
    const canManage = state.canManageBoard(board);
    sheetTitle = board.title;
    sheetMeta = t('board.edited', { when: formatUpdatedAt(board.updatedAt) });
    sheetPage = `row-${board.id}`;
    const done = (fn: () => void) => () => {
      setSheet(null);
      fn();
    };
    sheetBody = (
      <>
        <SheetGroup>
          {!here && (
            <SheetRow
              icon={<FileText aria-hidden="true" />}
              label={t('menu.open')}
              onClick={() => {
                setSheet(null);
                closeDrawer();
                state.openBoard(board.id);
              }}
            />
          )}
          {board.archivedAt ? (
            <SheetRow
              icon={<ArchiveRestore aria-hidden="true" />}
              label={t('boards.unarchive')}
              onClick={done(() => void state.unarchiveBoard(board.id).catch(() => {}))}
            />
          ) : board.pin ? (
            <SheetRow
              icon={<PinOff aria-hidden="true" />}
              label={t('boards.unpin')}
              onClick={done(() => state.unpinBoard(board.id))}
            />
          ) : (
            <SheetRow
              icon={<Pin aria-hidden="true" />}
              label={t('boards.pin')}
              onClick={done(() => state.pinBoard(board.id))}
            />
          )}
          {canManage && (
            <SheetRow
              icon={<Pencil aria-hidden="true" />}
              label={t('common.rename')}
              onClick={() => {
                setSheet(null);
                state.beginRename(board.id);
              }}
            />
          )}
        </SheetGroup>
        {canManage && !board.archivedAt && (
          <SheetGroup>
            <SheetRow
              icon={<Archive aria-hidden="true" />}
              label={t('boards.archive')}
              onClick={done(() => void state.archiveBoard(board.id).catch(() => {}))}
            />
          </SheetGroup>
        )}
        {canManage && (
          <SheetGroup>
            <SheetRow
              icon={<Trash2 aria-hidden="true" />}
              label={t('common.deleteEllipsis')}
              danger
              onClick={() => {
                setSheet(null);
                setDeleteError(null);
                setPendingDelete(board);
              }}
            />
          </SheetGroup>
        )}
      </>
    );
  } else if (sheet?.kind === 'workspace') {
    sheetTitle = sheet.page === 'create' ? t('workspace.create') : t('manage.workspaces');
    sheetMeta = user?.email ?? null;
    sheetPage = `workspace-${sheet.page ?? ''}`;
    if (sheet.page === 'create') {
      sheetBack = () => setSheet({ kind: 'workspace' });
      sheetBody = (
        <NewWorkspace
          busy={state.busy}
          onCreate={(name) => {
            setSheet(null);
            state.createWorkspace(name);
          }}
        />
      );
    } else {
      const entries = [
        ...(state.workspaces ?? []).map((it) => ({ ...it, shared: false })),
        ...(state.openBoardIsShared || (state.sharedBoards?.length ?? 0) > 0
          ? [
              {
                id: SHARED_WITH_YOU,
                name: t('boards.sharedWithYou'),
                boardCount: state.sharedBoards?.length ?? 0,
                logoUrl: null,
                plan: null,
                shared: true,
              },
            ]
          : []),
      ];
      sheetBody = (
        <>
          {state.error && <p className="px-1 text-[13px] text-destructive">{state.error}</p>}
          <div className="shrink-0 overflow-hidden rounded-[14px] bg-sidebar-accent [--rule-left:58px]">
            {entries.map((it) => (
              <SheetRow
                key={it.id}
                icon={
                  it.shared ? (
                    <SharedBadge className="size-[30px]" />
                  ) : (
                    <InitialBadge
                      label={it.name}
                      src={it.logoUrl}
                      className="size-[30px] rounded-[9px] text-[11px]"
                    />
                  )
                }
                label={it.name}
                sub={
                  it.plan
                    ? `${PLAN_NAMES[it.plan]} · ${t('boards.count', { count: it.boardCount })}`
                    : t('boards.count', { count: it.boardCount })
                }
                end={
                  it.id === listedId ? (
                    <Check className="size-[19px] text-primary" aria-hidden="true" />
                  ) : undefined
                }
                onClick={() => {
                  setSheet(null);
                  state.browseWorkspace(it.id);
                }}
              />
            ))}
          </div>
          <SheetGroup>
            <SheetRow
              icon={<Plus aria-hidden="true" />}
              label={t('workspace.create')}
              disabled={state.busy}
              onClick={() => setSheet({ kind: 'workspace', page: 'create' })}
            />
            <SheetRow
              icon={<Settings2 aria-hidden="true" />}
              label={t('workspace.manage')}
              onClick={() => {
                setSheet(null);
                // Out of the way: the workspaces open as a sheet of their own.
                closeDrawer();
                state.beginManage({ kind: 'workspaces' });
              }}
            />
          </SheetGroup>
        </>
      );
    }
  } else if (sheet?.kind === 'account') {
    const back = () => setSheet({ kind: 'account' });
    sheetPage = `account-${sheet.page ?? ''}`;
    if (sheet.page === 'language') {
      sheetTitle = t('menu.language');
      sheetBack = back;
      sheetBody = <LanguagePage />;
    } else if (sheet.page === 'preferences') {
      sheetTitle = t('menu.preferences');
      sheetBack = back;
      sheetBody = PREFERENCE_GROUPS.map((group) => (
        <SheetGroup key={group.id} inset={false}>
          {group.items.map((item) => {
            const on = preferences.values[item.id];
            return (
              <SheetRow
                key={item.id}
                label={t(item.labelKey)}
                sub={t(item.hintKey)}
                role="switch"
                checked={on}
                end={<RowSwitch on={on} />}
                onClick={() => preferences.set(item.id, !on)}
                testId={`drawer-preference-${item.id}`}
              />
            );
          })}
        </SheetGroup>
      ));
    } else if (sheet.page === 'learn') {
      sheetTitle = t('menu.learnMore');
      sheetBack = back;
      // Only the pages and actions that are there: nothing waiting on its page.
      sheetBody = LEARN_MORE_GROUPS.map((group) =>
        group.flatMap((item) => {
          let run: (() => void) | undefined;
          if (item.action) run = runAction(item.action);
          else if (item.path) {
            const href = new URL(item.path, env.VITE_WEB_URL).toString();
            run = () => window.open(href, '_blank', 'noopener,noreferrer');
          }
          return run ? [{ item, run }] : [];
        }),
      )
        .filter((group) => group.length > 0)
        .map((group, index) => (
          <SheetGroup key={index}>
            {group.map(({ item, run }) => {
              const Icon = item.icon;
              return (
                <SheetRow
                  key={item.id}
                  icon={Icon ? <Icon aria-hidden="true" /> : <span className="w-[19px]" />}
                  label={t(item.labelKey)}
                  onClick={run}
                />
              );
            })}
          </SheetGroup>
        ));
    } else {
      sheetTitle = accountName;
      sheetMeta = accountless ? accountDetail : (user?.email ?? null);
      sheetLead = (
        <InitialBadge
          label={accountName}
          src={user?.avatarUrl ?? null}
          person
          icon={accountless ? <UserRound className="size-4" aria-hidden="true" /> : undefined}
          className="size-10 text-sm"
        />
      );
      const { languages } = languageInfo();
      // Offered to whoever runs the workspace's billing, as Settings ▸ Billing is.
      const next = workspace && !shared ? NEXT_PLAN[workspace.plan] : undefined;
      const canUpgrade =
        next && onUpgrade && (workspace?.role === 'owner' || workspace?.role === 'admin');
      const nextPrice = next ? PLAN_PRICES[next.plan] : undefined;
      sheetBody = (
        <>
          {canUpgrade && workspace && next && (
            <SheetGroup>
              <SheetRow
                icon={<CircleArrowUp className="!text-sidebar-primary" aria-hidden="true" />}
                label={
                  <span className="text-sidebar-primary">
                    {t('drawer.upgrade.to', { plan: PLAN_NAMES[next.plan] })}
                  </span>
                }
                sub={t(next.hintKey)}
                end={
                  nextPrice ? `${formatPlanPrice(nextPrice.yearly)}${t('ps.perMonth')}` : undefined
                }
                onClick={() => {
                  setSheet(null);
                  onUpgrade(workspace.id);
                }}
                testId="drawer-upgrade"
              />
            </SheetGroup>
          )}
          {accountless && (
            <SheetGroup>
              {(['yourBoards', 'signIn', 'signUp'] as const).map((id) =>
                actions?.[id] ? menuRow(id) : null,
              )}
            </SheetGroup>
          )}
          {/* Settings sits with the other preferences, not on a card of its own. */}
          <SheetGroup>
            {!accountless && menuRow('settings', false, chevron)}
            <SheetRow
              icon={<Sun aria-hidden="true" />}
              label={t('theme.title')}
              end={
                <span
                  role="radiogroup"
                  aria-label={t('theme.title')}
                  className="flex gap-0.5 rounded-[9px] bg-sidebar-foreground/10 p-0.5"
                >
                  {THEMES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={theme === option.value}
                      onClick={() => onThemeChange(option.value)}
                      className={cn(
                        'h-7 rounded-[7px] px-2.5 text-[13px]',
                        theme === option.value
                          ? 'bg-sidebar text-sidebar-foreground shadow-sm'
                          : 'text-sidebar-foreground/70',
                      )}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </span>
              }
            />
            <LanguageRow
              languages={languages}
              onOpen={() => setSheet({ kind: 'account', page: 'language' })}
            />
            <SheetRow
              icon={<SlidersHorizontal aria-hidden="true" />}
              label={t('menu.preferences')}
              end={chevron}
              onClick={() => setSheet({ kind: 'account', page: 'preferences' })}
              testId="drawer-preferences"
            />
            <SheetRow
              icon={<Info aria-hidden="true" />}
              label={t('menu.learnMore')}
              end={chevron}
              onClick={() => setSheet({ kind: 'account', page: 'learn' })}
            />
          </SheetGroup>
          {!accountless && actions?.signOut !== false && (
            <SheetGroup>{menuRow('signOut', true)}</SheetGroup>
          )}
        </>
      );
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-2.5 pt-[calc(env(safe-area-inset-top)+10px)] pb-[calc(env(safe-area-inset-bottom)+10px)]">
      {/* The workspace, and the way out. */}
      <div className="flex shrink-0 items-center gap-1 pb-2.5">
        <button
          type="button"
          onClick={() => setSheet({ kind: 'workspace' })}
          disabled={!state.available || state.local}
          aria-label={t('workspace.switch', { name: workspaceName })}
          className="flex h-[50px] min-w-0 flex-1 items-center gap-2.5 rounded-xl pr-2 pl-1.5 text-left active:bg-sidebar-foreground/5 disabled:opacity-100"
          data-testid="drawer-workspace"
        >
          {shared ? (
            <SharedBadge className="size-8 rounded-[9px]" />
          ) : (
            <InitialBadge
              label={workspaceName}
              src={workspace?.logoUrl ?? null}
              className="size-8 rounded-[9px] text-xs"
            />
          )}
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <b className="truncate text-[14.5px] font-semibold">{workspaceName}</b>
            {workspaceMeta && (
              <span className="truncate text-xs text-sidebar-foreground/55">{workspaceMeta}</span>
            )}
          </span>
          {state.available && !state.local && (
            <ChevronsUpDown
              className="size-4 shrink-0 text-sidebar-foreground/55"
              aria-hidden="true"
            />
          )}
        </button>
        <button
          type="button"
          onClick={closeDrawer}
          aria-label={t('common.close')}
          className="grid size-10 shrink-0 place-items-center rounded-[10px] text-sidebar-foreground/80 active:bg-sidebar-foreground/10"
          data-testid="drawer-close"
        >
          <X className="size-[18px]" aria-hidden="true" />
        </button>
      </div>

      {/* The library: shapes for every board, so above any one of them. */}
      {library && (
        <div className="mb-3 flex shrink-0 flex-col border-b border-sidebar-border pb-2">
          <button
            type="button"
            onClick={() => {
              closeDrawer();
              library.open();
            }}
            aria-label={t('ps.lib.row', { count: library.count })}
            className="flex h-[46px] w-full items-center gap-[13px] rounded-[10px] px-2.5 text-left text-[15.5px] text-sidebar-foreground/90 active:bg-sidebar-foreground/5 [&>svg]:size-[21px] [&>svg]:shrink-0 [&>svg]:text-sidebar-foreground/55"
            data-testid="drawer-library"
          >
            <LibraryBig aria-hidden="true" />
            <span>{t('library.title')}</span>
            <span className="ml-auto font-mono text-[11px] text-sidebar-foreground/40">
              {library.count}
            </span>
          </button>
        </div>
      )}

      {/* Find a board, or start one. */}
      {state.available && !state.local && (
        <div className="flex shrink-0 gap-2 px-0.5 pb-3.5">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[11px] border border-sidebar-border bg-sidebar-accent px-3 text-sidebar-foreground/55 focus-within:border-primary">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('boards.find')}
              aria-label={t('boards.find')}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-base text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/45"
              data-testid="drawer-find"
            />
          </label>
          {!shared && listedId && (
            <button
              type="button"
              onClick={() => {
                closeDrawer();
                state.createBoard(listedId);
              }}
              disabled={state.busy}
              aria-label={t('boards.new')}
              className="grid size-10 shrink-0 place-items-center rounded-[11px] border border-sidebar-border bg-sidebar-accent text-sidebar-foreground active:bg-sidebar-foreground/10"
              data-testid="drawer-new-board"
            >
              <Plus className="size-[19px]" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1 [scrollbar-width:none]">
        {/* The board on screen: back to it, or what can be done to it. */}
        {!needle && (
          <div className="mb-3.5 flex shrink-0 items-center gap-0.5 rounded-[14px] border border-sidebar-border bg-sidebar-accent py-1.5 pr-0.5 pl-1.5">
            <button
              type="button"
              onClick={closeDrawer}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] p-0.5 text-left"
              data-testid="drawer-current-board"
            >
              <Thumb src={thumbnail} />
              <span className="flex min-w-0 flex-col gap-[3px]">
                <b className="truncate text-sm font-semibold">{state.title}</b>
                <span className="flex items-center gap-1.5 truncate text-xs text-sidebar-foreground/55">
                  {peopleHere > 1 && (
                    <span
                      aria-hidden="true"
                      className="size-[7px] shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgb(34_197_94/0.18)]"
                    />
                  )}
                  {[
                    peopleHere > 1 ? t('collab.peopleHere', { count: peopleHere }) : null,
                    current
                      ? t('board.edited', { when: formatUpdatedAt(current.updatedAt) })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSheet({ kind: 'board' })}
              aria-label={t('board.actions')}
              className="grid size-9 shrink-0 place-items-center rounded-[9px] text-sidebar-foreground/50 active:bg-sidebar-foreground/10"
              data-testid="drawer-board-actions"
            >
              <Ellipsis className="size-[18px]" aria-hidden="true" />
            </button>
          </div>
        )}

        {shared ? (
          section(SHARED_WITH_YOU, t('boards.sharedWithYou'), sharedBoards)
        ) : (
          <>
            {section('pinned', t('boards.pinned'), pinned)}
            {section('recent', t('menu.yourBoards'), listed)}
            {section('archived', t('boards.archived'), archived)}
          </>
        )}
        {nothingFound && (
          <p className="px-2.5 py-5 text-center text-[13px] text-sidebar-foreground/55">
            {t('boards.noMatch')}
          </p>
        )}
      </div>

      {/* The account, and its settings one tap away. */}
      <div className="mt-1.5 flex shrink-0 items-center gap-1 border-t border-sidebar-border pt-2.5">
        <button
          type="button"
          onClick={() => setSheet({ kind: 'account' })}
          className="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-xl pr-2 pl-1 text-left active:bg-sidebar-foreground/5"
          aria-label={t('menu.accountActions', { name: accountName })}
          data-testid="drawer-account"
        >
          <InitialBadge
            label={accountName}
            src={user?.avatarUrl ?? null}
            person
            icon={accountless ? <UserRound className="size-4" aria-hidden="true" /> : undefined}
            className="size-8 text-xs"
          />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <b className="truncate text-sm font-semibold">{accountName}</b>
            {accountDetail && (
              <span className="truncate text-xs text-sidebar-foreground/55">{accountDetail}</span>
            )}
          </span>
          {plan && (
            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
              {PLAN_NAMES[plan]}
            </span>
          )}
          <ChevronsUpDown
            className="size-4 shrink-0 text-sidebar-foreground/55"
            aria-hidden="true"
          />
        </button>
      </div>

      <PhoneSheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        title={sheetTitle}
        meta={sheetMeta}
        lead={sheetLead}
        onBack={sheetBack}
        page={sheetPage}
        container={portalContainer}
      >
        {sheetBody}
      </PhoneSheet>

      <DeleteWarningDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        theme={surfaceTheme}
        busy={state.busy}
        error={deleteError}
        onConfirm={confirmDelete}
        title={t('boards.deleteTitle', { title: pendingDelete?.title ?? t('boards.thisBoard') })}
        confirmLabel={t('boards.deleteConfirm')}
        description={t('boards.deleteWarning')}
      />
    </div>
  );
}

/** Shorter names for the tiles, where a word or two has to fit under an icon. */
const TILE_LABELS: Partial<Record<MenuItemId, TranslationKey>> = {
  liveCollaboration: 'drawer.tile.share',
  copyLink: 'drawer.tile.copyLink',
  exportImage: 'drawer.tile.export',
  renameBoard: 'common.rename',
};

/** The open board, small: what it holds, so it reads as this board at a glance. */
function Thumb({ src, small = false }: { src: string | null; small?: boolean }) {
  return (
    <span
      className={cn(
        'block shrink-0 overflow-hidden rounded-[9px] border border-sidebar-border bg-sidebar p-1',
        small ? 'h-9 w-[46px]' : 'h-[42px] w-[54px]',
      )}
    >
      {src && <img src={src} alt="" className="size-full object-contain" />}
    </span>
  );
}

function languageInfo() {
  return { languages: listedLanguages() };
}

function LanguageRow({
  languages,
  onOpen,
}: {
  languages: ReturnType<typeof listedLanguages>;
  onOpen: () => void;
}) {
  const { locale, t } = useI18n();
  return (
    <SheetRow
      icon={<Globe aria-hidden="true" />}
      label={t('menu.language')}
      end={
        <>
          {languages.find((language) => language.code === locale)?.label}
          <ChevronRight className="size-4" aria-hidden="true" />
        </>
      }
      onClick={onOpen}
    />
  );
}

function LanguagePage() {
  const { locale, setLocale } = useI18n();
  return (
    <SheetGroup inset={false}>
      {listedLanguages().map((language) => (
        <SheetRow
          key={language.code}
          label={language.label}
          end={
            language.code === locale ? (
              <Check className="size-[19px] text-primary" aria-hidden="true" />
            ) : undefined
          }
          onClick={() => setLocale(language.code)}
        />
      ))}
    </SheetGroup>
  );
}

function NewWorkspace({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="flex shrink-0 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
    >
      <input
        ref={inputRef}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t('workspace.name')}
        aria-label={t('workspace.name')}
        autoFocus
        className="h-11 rounded-[11px] border border-sidebar-border bg-sidebar-accent px-3 text-base text-sidebar-foreground outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="h-11 rounded-[11px] bg-primary text-[15px] font-medium text-primary-foreground disabled:opacity-50"
      >
        {t('common.add')}
      </button>
    </form>
  );
}
