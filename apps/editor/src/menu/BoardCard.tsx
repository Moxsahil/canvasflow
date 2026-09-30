import { Fragment, type ReactNode } from 'react';
import { Ellipsis, Files } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { ariaKeyShortcut, formatShortcut } from '../help/platform';
import { ColorDot, formatUpdatedAt } from '../workspace/board-presentation';
import type { BoardSwitcherState } from '../workspace';
import {
  BOARD_CARD_ITEMS,
  BOARD_MORE_GROUPS,
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
  const entry = state.workspaceId ? state.boardsFor(state.workspaceId) : undefined;
  const board =
    entry?.status === 'ready' ? entry.boards.find((it) => it.id === state.boardId) : undefined;

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <section
          aria-label="This board"
          className="flex flex-col gap-2 rounded-lg border border-sidebar-border p-2"
        >
          <div className="flex min-w-0 items-center gap-2 px-1">
            {/* Only once the list has said what it is: a gray dot for a
                purple board is worse than no dot at all. */}
            {board && <ColorDot color={board.color} />}
            <div className="grid min-w-0 leading-tight">
              <span className="truncate text-sm font-medium">{state.title}</span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {board ? `Edited ${formatUpdatedAt(board.updatedAt)}` : 'This board'}
              </span>
            </div>
          </div>

          <div
            role="group"
            aria-label="Board actions"
            className="flex items-center justify-between"
          >
            {BOARD_CARD_ITEMS.map((id) => (
              <CardAction key={id} id={id} onSelect={actions?.[id]} />
            ))}
            <BoardActionsMenu
              groups={BOARD_MORE_GROUPS}
              actions={actions}
              portalContainer={portalContainer}
              trigger={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InlineDropdownMenuTrigger
                      aria-label="More board actions"
                      data-testid="menu-board-more"
                      className={cardButtonClasses}
                    >
                      <Ellipsis aria-hidden="true" />
                    </InlineDropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">More</TooltipContent>
                </Tooltip>
              }
            />
          </div>
        </section>
      </SidebarGroup>

      <SidebarGroup className="hidden pt-0 group-data-[collapsible=icon]:flex">
        <SidebarMenu>
          <SidebarMenuItem>
            <BoardActionsMenu
              caption={state.title}
              groups={[BOARD_CARD_ITEMS, ...BOARD_MORE_GROUPS]}
              actions={actions}
              portalContainer={portalContainer}
              trigger={
                <SidebarMenuButton asChild tooltip="Board actions">
                  <InlineDropdownMenuTrigger data-testid="menu-board-actions">
                    <Files aria-hidden="true" />
                    <span>Board actions</span>
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

/**
 * One of the card's icons. Its name is the button's label and its tooltip, with
 * the shortcut when it has one. Disabled with `aria-disabled` rather than
 * `disabled`, so the tooltip can still say why it is — a disabled button
 * swallows the pointer events a tooltip opens on.
 */
function CardAction({ id, onSelect }: { id: MenuItemId; onSelect?: (() => void) | null }) {
  const { label, icon: Icon, shortcut } = MENU_ITEMS[id];
  const hint = onSelect && shortcut ? formatShortcut(shortcut) : null;
  // Only an unbuilt feature is "coming soon" — see MenuActions.
  const tip =
    onSelect === undefined ? `${label} — coming soon` : hint ? `${label} · ${hint}` : label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-disabled={!onSelect}
          aria-keyshortcuts={onSelect && shortcut ? ariaKeyShortcut(shortcut) : undefined}
          data-testid={`menu-${id}`}
          className={cardButtonClasses}
          onClick={() => onSelect?.()}
        >
          <Icon aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tip}</TooltipContent>
    </Tooltip>
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
  return (
    <InlineDropdownMenu>
      {trigger}
      <InlineDropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        container={portalContainer}
        aria-label="Board actions"
      >
        {caption && (
          <InlineDropdownMenuLabel className="truncate">{caption}</InlineDropdownMenuLabel>
        )}
        {groups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 && <InlineDropdownMenuSeparator />}
            {group.map((id) => (
              <ActionItem key={id} id={id} onSelect={actions?.[id]} />
            ))}
          </Fragment>
        ))}
      </InlineDropdownMenuContent>
    </InlineDropdownMenu>
  );
}

function ActionItem({ id, onSelect }: { id: MenuItemId; onSelect?: (() => void) | null }) {
  const { label, icon: Icon, shortcut, destructive } = MENU_ITEMS[id];
  return (
    <InlineDropdownMenuItem
      disabled={!onSelect}
      onSelect={onSelect ?? undefined}
      icon={<Icon aria-hidden="true" />}
      badge={
        onSelect === undefined ? <InlineDropdownMenuBadge>Soon</InlineDropdownMenuBadge> : null
      }
      aria-keyshortcuts={onSelect && shortcut ? ariaKeyShortcut(shortcut) : undefined}
      data-testid={`menu-item-${id}`}
      className={cn(destructive && menuDangerRowClasses)}
    >
      {label}
    </InlineDropdownMenuItem>
  );
}
