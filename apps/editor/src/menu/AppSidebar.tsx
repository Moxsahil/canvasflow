import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { formatShortcut } from '../help/platform';
import { BoardSwitcher, RenameBoardDialog, type BoardSwitcherState } from '../workspace';
import type { ThemePreference } from '../theme';
import type { CanvasTheme } from '../properties/palette';
import { BackgroundSection, ThemeSection } from './AppearanceSections';
import { MenuSection } from './MenuSection';
import { NavUser, type SidebarUser } from './NavUser';
import {
  MENU_ITEMS,
  SIDEBAR_ITEMS,
  SIDEBAR_SECTIONS,
  type MenuActions,
  type MenuItemId,
} from './menu-items';

interface AppSidebarProps {
  /** The board on screen, and the workspaces and boards it can be swapped for. */
  boardSwitcher: BoardSwitcherState;
  /** Signed-in user, for the account row at the foot. */
  user: SidebarUser | null;
  canvasBackground: string;
  onCanvasBackgroundChange: (color: string) => void;
  /**
   * The theme actually on screen. Distinct from `theme` below, which is the
   * preference and may be `system` — the background swatches have to preview a
   * real column, so they need the resolved one.
   */
  canvasTheme: CanvasTheme;
  /** Theme preference, including `system` — see theme/useAppTheme. */
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
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
 * The editor's sidebar: the board it is showing at the top, what can be done to
 * that board in the middle, appearance and the account at the foot.
 *
 * Everything in it is drawn from the sidebar's own palette — no chrome tokens,
 * no hand-rolled rows — so it reads as one surface with the popups it opens.
 * Collapses to an icon column and back by the rail on its edge or ⌘B, and the
 * state persists in the cookie the sidebar writes for itself.
 */
export function AppSidebar({
  boardSwitcher,
  user,
  canvasBackground,
  onCanvasBackgroundChange,
  canvasTheme,
  theme,
  onThemeChange,
  actions,
  portalContainer,
}: AppSidebarProps) {
  return (
    // No rule down the edge: the canvas runs right up to the sidebar, and a
    // line between them reads as a seam in the window rather than as chrome.
    <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <BoardSwitcher state={boardSwitcher} portalContainer={portalContainer} />
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {SIDEBAR_SECTIONS.map((section) => (
                <MenuSection
                  key={section.id}
                  label={section.label}
                  defaultOpen={section.defaultOpen}
                  icon={<section.icon />}
                >
                  {section.items.map((id) => (
                    <MenuSubRow key={id} id={id} onSelect={actions?.[id]} />
                  ))}
                </MenuSection>
              ))}
              {SIDEBAR_ITEMS.map((id) => (
                <MenuRow key={id} id={id} onSelect={actions?.[id]} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Appearance</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <ThemeSection value={theme} onChange={onThemeChange} />
              <BackgroundSection
                value={canvasBackground}
                onChange={onCanvasBackgroundChange}
                theme={canvasTheme}
              />
              <MenuRow id="preferences" onSelect={actions?.preferences} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <NavUser user={user} actions={actions} portalContainer={portalContainer} />
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />

      {/* Mounted here rather than inside the switcher, because the Board
          section's own "Rename board" row opens it without the switcher ever
          being touched — and the switcher's menu closes as the dialog opens,
          which would take a dialog living inside it down with it. */}
      <RenameBoardDialog
        target={boardSwitcher.renameTarget}
        onOpenChange={(open) => {
          if (!open) boardSwitcher.endRename();
        }}
        onSubmit={boardSwitcher.renameBoard}
        busy={boardSwitcher.busy}
        portalContainer={portalContainer}
      />
    </Sidebar>
  );
}

interface RowProps {
  id: MenuItemId;
  /** Absent means the feature isn't built yet: the row disables itself. */
  onSelect?: () => void;
}

/** A row inside an expanded section. No icon column — the indent carries it. */
function MenuSubRow({ id, onSelect }: RowProps) {
  const { label, shortcut, destructive } = MENU_ITEMS[id];
  const hint = shortcut ? formatShortcut(shortcut) : null;

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild>
        <button
          type="button"
          onClick={onSelect}
          disabled={!onSelect}
          aria-keyshortcuts={hint ?? undefined}
          data-testid={`menu-${id}`}
          className={cn(destructive && 'text-destructive hover:text-destructive')}
        >
          <span>{label}</span>
          <span className="ml-auto shrink-0 text-xs opacity-50">{onSelect ? hint : 'Soon'}</span>
        </button>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

/** A row that stands on its own, with its icon in the collapsed column. */
function MenuRow({ id, onSelect }: RowProps) {
  const { label, icon: Icon, shortcut, destructive } = MENU_ITEMS[id];
  const hint = shortcut ? formatShortcut(shortcut) : null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onSelect}
        disabled={!onSelect}
        tooltip={onSelect ? label : `${label} — coming soon`}
        aria-keyshortcuts={hint ?? undefined}
        data-testid={`menu-${id}`}
        className={cn(destructive && 'text-destructive')}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
        <span className="ml-auto shrink-0 text-xs opacity-50">{onSelect ? hint : 'Soon'}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
