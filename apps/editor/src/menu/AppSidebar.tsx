import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { formatShortcut } from '../help/platform';
import {
  ManageDialog,
  RenameBoardDialog,
  WorkspaceSwitcher,
  type BoardSwitcherState,
} from '../workspace';
import { PreferencesMenu, type PreferencesState } from '../preferences';
import type { ThemePreference } from '../theme';
import type { SurfaceTheme } from '../ui/surface-palette';
import { BoardCard } from './BoardCard';
import { BoardList, RailSeparator } from './BoardList';
import { ThemeToggle } from './ThemeToggle';
import { NavUser, type SidebarUser } from './NavUser';
import { MENU_ITEMS, SIDEBAR_ITEMS, type MenuActions, type MenuItemId } from './menu-items';

interface AppSidebarProps {
  /** The board on screen, and the workspaces and boards it can be swapped for. */
  boardSwitcher: BoardSwitcherState;
  /** Signed-in user, for the account row at the foot. */
  user: SidebarUser | null;
  /** Theme preference, including `system` — see theme/useAppTheme. */
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  /**
   * That preference resolved to what is actually on screen. The dialogs opened
   * from here paint their own surface, which has a light and a dark form and no
   * notion of following the system.
   */
  surfaceTheme: SurfaceTheme;
  /** What the preferences menu is showing, and how to change it. */
  preferences: PreferencesState;
  /** Only the items with a handler here are usable; the rest read as "Soon". */
  actions?: MenuActions;
  /**
   * The editor root, which every popup opened here portals into. Not <body>:
   * each colour in them is a token declared on that element, so a body-level
   * popup would paint with unresolved var()s and ignore the dark theme.
   */
  portalContainer: HTMLElement | null;
}

/**
 * The editor's sidebar, laid out as a library of the workspace's boards: the
 * workspace at the top, its boards one click apart in the middle with the open
 * board's card under them, and help, appearance and the account at the foot.
 *
 * Everything in it is drawn from the sidebar's own palette — no chrome tokens,
 * no hand-rolled rows — so it reads as one surface with the popups it opens.
 * Collapses to an icon rail and back by the button beside the workspace, the
 * rail on its edge or ⌘B, and the state persists in the cookie the sidebar
 * writes for itself.
 */
export function AppSidebar({
  boardSwitcher,
  user,
  theme,
  onThemeChange,
  surfaceTheme,
  preferences,
  actions,
  portalContainer,
}: AppSidebarProps) {
  return (
    // No rule down the edge: the canvas runs right up to the sidebar, and a
    // line between them reads as a seam in the window rather than as chrome.
    <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
      <SidebarHeader className="flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col">
        {/* The rail starts at the button that opens it again: the workspace
            has nothing to show there that the open sidebar doesn't. */}
        <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <WorkspaceSwitcher state={boardSwitcher} portalContainer={portalContainer} />
        </SidebarMenu>
        <CollapseButton />
      </SidebarHeader>

      <SidebarContent>
        <BoardList state={boardSwitcher} portalContainer={portalContainer} theme={surfaceTheme} />
        <RailSeparator />
        <BoardCard state={boardSwitcher} actions={actions} portalContainer={portalContainer} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {SIDEBAR_ITEMS.map((id) => (
            <MenuRow key={id} id={id} onSelect={actions?.[id]} />
          ))}
          <ThemeToggle value={theme} onChange={onThemeChange} />
          <PreferencesMenu preferences={preferences} portalContainer={portalContainer} />
        </SidebarMenu>
        <SidebarMenu>
          <NavUser user={user} actions={actions} portalContainer={portalContainer} />
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />

      {/* Mounted here rather than inside the list or the card, because both
          open it — and a menu that closes as the dialog opens would take a
          dialog living inside it down with it. */}
      <RenameBoardDialog
        target={boardSwitcher.renameTarget}
        onOpenChange={(open) => {
          if (!open) boardSwitcher.endRename();
        }}
        onSubmit={boardSwitcher.renameBoard}
        busy={boardSwitcher.busy}
        theme={surfaceTheme}
      />

      {/* Same reasoning: opened from the workspace menu and from the list. */}
      <ManageDialog state={boardSwitcher} theme={surfaceTheme} />
    </Sidebar>
  );
}

/**
 * Beside the workspace, where the sidebar can be put away from; above the rail
 * once it has been, where it comes back from. Named for what it will do.
 */
function CollapseButton() {
  const { state } = useSidebar();
  const label = state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <SidebarTrigger
      title={`${label} · ${formatShortcut('mod+b')}`}
      aria-label={label}
      data-testid="sidebar-collapse"
      className="shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    />
  );
}

interface RowProps {
  id: MenuItemId;
  /**
   * A function makes the row live. `null` means the feature exists but does
   * not apply right now, and absent means it isn't built — see `MenuActions`.
   * Both disable the row; only the last one says "Soon".
   */
  onSelect?: (() => void) | null;
}

/** What the right-hand column of a row shows: its shortcut, or why it can't be used. */
function rowHint(onSelect: RowProps['onSelect'], shortcut?: string) {
  const hint = shortcut ? formatShortcut(shortcut) : null;
  return { hint, badge: onSelect === undefined ? 'Soon' : hint };
}

/** A row that stands on its own, with its icon in the collapsed column. */
function MenuRow({ id, onSelect }: RowProps) {
  const { label, icon: Icon, shortcut, destructive } = MENU_ITEMS[id];
  const { hint, badge } = rowHint(onSelect, shortcut);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onSelect ?? undefined}
        disabled={!onSelect}
        tooltip={onSelect === undefined ? `${label} — coming soon` : label}
        aria-keyshortcuts={hint ?? undefined}
        data-testid={`menu-${id}`}
        className={cn(destructive && 'text-destructive')}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
        <span className="ml-auto shrink-0 text-xs opacity-50">{badge}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
