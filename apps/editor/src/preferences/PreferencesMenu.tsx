import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { formatShortcut } from '../help/platform';
import { MENU_ITEMS } from '../menu/menu-items';
import { PREFERENCE_GROUPS } from './preferences';
import type { PreferencesState } from './usePreferences';

interface PreferencesMenuProps {
  preferences: PreferencesState;
  /**
   * The editor root, which the menu portals into rather than <body>: every
   * colour in it is a token declared on that element.
   */
  portalContainer: HTMLElement | null;
}

/**
 * The sidebar's preferences row, and the menu it opens beside itself.
 *
 * A flyout rather than a section that expands in place: there are more
 * preferences than there are rows in the rest of the rail put together, and
 * unfolding them into it would bury the board's own actions. Opening to the
 * side also works from the collapsed rail, where the row is an icon and has
 * nothing to unfold into.
 */
export function PreferencesMenu({ preferences, portalContainer }: PreferencesMenuProps) {
  const { label, icon: Icon } = MENU_ITEMS.preferences;

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <SidebarMenuButton asChild tooltip={label} data-testid="menu-preferences">
          <DropdownMenuTrigger>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <ChevronRight className="ml-auto shrink-0" />
          </DropdownMenuTrigger>
        </SidebarMenuButton>

        {/* Out over the canvas, aligned with the row: the rail is against the
            left edge of the window, so this is the only side with room, and it
            is where the row's own chevron points. */}
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={8}
          aria-label={label}
          container={portalContainer}
          className="min-w-52"
        >
          {PREFERENCE_GROUPS.map((group, index) => (
            <Fragment key={group.id}>
              {index > 0 && <DropdownMenuSeparator />}
              {group.items.map((item) => (
                <DropdownMenuCheckboxItem
                  key={item.id}
                  checked={preferences.values[item.id]}
                  title={item.hint}
                  data-testid={`preference-${item.id}`}
                  // Ticking a box is not choosing a command: the menu stays up
                  // so the next one can be ticked without reopening it, which
                  // is the whole reason these live together in a list.
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(next) => preferences.set(item.id, next)}
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span className="ml-auto pl-4 text-xs opacity-50">
                      {formatShortcut(item.shortcut)}
                    </span>
                  )}
                </DropdownMenuCheckboxItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
