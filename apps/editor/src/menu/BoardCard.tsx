import { Fragment, type ReactNode } from 'react';
import { Ellipsis, Files } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { menuDangerRowClasses } from '@/components/ui/menu-look';
import {
  InlineDropdownMenu,
  InlineDropdownMenuBadge,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuLabel,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ariaKeyShortcut } from '../help/platform';
import { useT } from '../i18n';
import { formatUpdatedAt } from '../workspace/board-presentation';
import { useBoardName } from '../workspace/useBoardName';
import { isSecondPress } from './double-press';
import type { BoardSwitcherState } from '../workspace';
import {
  liveAction,
  BOARD_MENU_GROUPS,
  MENU_ITEMS,
  type MenuActions,
  type MenuItemId,
} from './menu-items';

interface BoardCardProps {
  state: BoardSwitcherState;
  actions?: MenuActions;
  portalContainer: HTMLElement | null;
}

/** The card's icon buttons: the size of the chrome's, on the sidebar's palette. */
const cardButtonClasses =
  'grid size-7 place-items-center rounded-md text-sidebar-foreground/80 outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground [&>svg]:size-4';

/**
 * The open board, under the list it was picked from: its name, when it last
 * changed, and what can be done to it.
 *
 * The actions people reach for most are a row of icons, each named by a
 * tooltip; the rest wait behind More, with Reset last and apart. In the
 * collapsed rail the card has no room, and all of them sit behind one button.
 */
export function BoardCard({ state, actions, portalContainer }: BoardCardProps) {
  const t = useT();
  const entry = state.workspaceId ? state.boardsFor(state.workspaceId) : undefined;
  const board =
    (entry?.status === 'ready' ? entry.boards.find((it) => it.id === state.boardId) : undefined) ??
    // One somebody let us onto is in the shared list, not in a workspace's.
    (state.openBoardIsShared
      ? state.sharedBoards?.find((it) => it.id === state.boardId)
      : undefined);
  const name = useBoardName(state.title, state.boardId);
  const loading = name === 'pending';

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <section
          aria-label={t('board.thisBoard')}
          className="flex items-center gap-2 rounded-[10px] bg-sidebar-accent/50 p-2.5"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {loading ? (
              <div className="grid gap-[7px] py-[2px]" aria-busy="true">
                <Skeleton className="h-[13px] w-32" />
                <Skeleton className="h-[11px] w-20" />
                <span className="sr-only">{t('common.loading')}</span>
              </div>
            ) : (
              <div className="grid min-w-0 leading-tight">
                {/* A double press on the name renames the board, as the pencil does. */}
                <span
                  className="truncate text-sm font-medium"
                  data-testid="board-card-title"
                  onClick={(event) => {
                    if (state.canRename && isSecondPress('board-card', event)) state.beginRename();
                  }}
                >
                  {name === 'unnamed' ? t('board.thisBoard') : state.title}
                </span>
                {name === 'named' && (
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    {board
                      ? t('board.edited', { when: formatUpdatedAt(board.updatedAt) })
                      : t('board.thisBoard')}
                  </span>
                )}
              </div>
            )}
          </div>

          <BoardActionsMenu
            groups={BOARD_MENU_GROUPS}
            actions={actions}
            portalContainer={portalContainer}
            trigger={
              <Tooltip>
                <TooltipTrigger asChild>
                  <InlineDropdownMenuTrigger
                    aria-label={t('board.moreActions')}
                    data-testid="menu-board-more"
                    className={cardButtonClasses}
                  >
                    <Ellipsis aria-hidden="true" />
                  </InlineDropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('common.more')}</TooltipContent>
              </Tooltip>
            }
          />
        </section>
      </SidebarGroup>

      <SidebarGroup className="hidden pt-0 group-data-[collapsible=icon]:flex">
        <SidebarMenu>
          <SidebarMenuItem>
            <BoardActionsMenu
              caption={state.title}
              groups={BOARD_MENU_GROUPS}
              actions={actions}
              portalContainer={portalContainer}
              trigger={
                <SidebarMenuButton asChild tooltip={t('board.actions')}>
                  <InlineDropdownMenuTrigger data-testid="menu-board-actions">
                    <Files aria-hidden="true" />
                    <span>{t('board.actions')}</span>
                  </InlineDropdownMenuTrigger>
                </SidebarMenuButton>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}

interface BoardActionsMenuProps {
  groups: readonly (readonly MenuItemId[])[];
  actions?: MenuActions;
  portalContainer: HTMLElement | null;
  /** Names the board over the list, where nothing else on screen does. */
  caption?: string;
  /** Must hold an `InlineDropdownMenuTrigger`. */
  trigger: ReactNode;
}

/** Board actions in the menu look, opening beside the sidebar over the canvas. */
function BoardActionsMenu({
  groups,
  actions,
  portalContainer,
  caption,
  trigger,
}: BoardActionsMenuProps) {
  const t = useT();
  return (
    <InlineDropdownMenu>
      {trigger}
      <InlineDropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        container={portalContainer}
        aria-label={t('board.actions')}
      >
        {caption && (
          <InlineDropdownMenuLabel className="truncate">{caption}</InlineDropdownMenuLabel>
        )}
        {groups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 && <InlineDropdownMenuSeparator />}
            {group.map((id) =>
              actions?.[id] === false ? null : (
                <ActionItem key={id} id={id} onSelect={liveAction(actions?.[id])} />
              ),
            )}
          </Fragment>
        ))}
      </InlineDropdownMenuContent>
    </InlineDropdownMenu>
  );
}

function ActionItem({ id, onSelect }: { id: MenuItemId; onSelect?: (() => void) | null }) {
  const t = useT();
  const { labelKey, icon: Icon, shortcut, destructive } = MENU_ITEMS[id];
  return (
    <InlineDropdownMenuItem
      disabled={!onSelect}
      onSelect={onSelect ?? undefined}
      icon={<Icon aria-hidden="true" />}
      badge={
        onSelect === undefined ? (
          <InlineDropdownMenuBadge>{t('common.soon')}</InlineDropdownMenuBadge>
        ) : null
      }
      aria-keyshortcuts={onSelect && shortcut ? ariaKeyShortcut(shortcut) : undefined}
      data-testid={`menu-item-${id}`}
      className={cn(destructive && menuDangerRowClasses)}
    >
      {t(labelKey)}
    </InlineDropdownMenuItem>
  );
}
