import { ChevronRight } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import {
  InlineDropdownMenu,
  InlineDropdownMenuContent,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuToggleItem,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { ariaKeyShortcut } from '../help/platform';
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
  const [open, setOpen] = useState(false);

  // Focus and view mode take the rail away, and with it the row this menu is
  // anchored to — left up, the menu would drift to the corner of the window.
  // Closed from here rather than on the row, so the shortcuts close it too.
  const chromeHidden = preferences.values.focusMode || preferences.values.viewMode;
  useEffect(() => {
    if (chromeHidden) setOpen(false);
  }, [chromeHidden]);

  return (
    <SidebarMenuItem>
      <InlineDropdownMenu open={open} onOpenChange={setOpen}>
        <SidebarMenuButton asChild tooltip={label} data-testid="menu-preferences">
          <InlineDropdownMenuTrigger>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <ChevronRight className="ml-auto shrink-0" />
          </InlineDropdownMenuTrigger>
        </SidebarMenuButton>

        {/* Out over the canvas, aligned with the row: the rail is against the
            left edge of the window, so this is the only side with room, and it
            is where the row's own chevron points. */}
        <InlineDropdownMenuContent
          side="right"
          align="start"
          sideOffset={8}
          aria-label={label}
          container={portalContainer}
        >
          {PREFERENCE_GROUPS.map((group, index) => (
            <Fragment key={group.id}>
              {index > 0 && <InlineDropdownMenuSeparator />}
              {group.items.map((item) => (
                // Ticking a box is not choosing a command: the menu stays up so
                // the next one can be ticked without reopening it, which is the
                // whole reason these live together in a list.
                <InlineDropdownMenuToggleItem
                  key={item.id}
                  checked={preferences.values[item.id]}
                  onToggle={() => preferences.set(item.id, !preferences.values[item.id])}
                  title={item.hint}
                  aria-keyshortcuts={item.shortcut ? ariaKeyShortcut(item.shortcut) : undefined}
                  data-testid={`preference-${item.id}`}
                >
                  {item.label}
                </InlineDropdownMenuToggleItem>
              ))}
            </Fragment>
          ))}
        </InlineDropdownMenuContent>
      </InlineDropdownMenu>
    </SidebarMenuItem>
  );
}
