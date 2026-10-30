import { Fragment } from 'react';
import {
  InlineDropdownMenuSeparator,
  InlineDropdownMenuSub,
  InlineDropdownMenuSubContent,
  InlineDropdownMenuSubTrigger,
  InlineDropdownMenuToggleItem,
} from '@/components/ui/inline-dropdown-menu';
import { MenuShortcut } from '@/components/ui/menu-look';
import { ariaKeyShortcut, formatShortcutKeys } from '../help/platform';
import { useT } from '../i18n';
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
 * Preferences, inside the account menu: a row that opens its list of switches
 * beside it, out over the canvas.
 */
export function PreferencesMenu({ preferences, portalContainer }: PreferencesMenuProps) {
  const t = useT();
  const label = t(MENU_ITEMS.preferences.labelKey);

  return (
    <InlineDropdownMenuSub>
      <InlineDropdownMenuSubTrigger data-testid="menu-preferences">
        {label}
      </InlineDropdownMenuSubTrigger>
      <InlineDropdownMenuSubContent
        aria-label={label}
        container={portalContainer}
        collisionPadding={8}
        className="w-[244px] max-w-none min-w-0"
      >
        {PREFERENCE_GROUPS.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 && <InlineDropdownMenuSeparator />}
            {group.items.map((item) => (
              // Flipping a switch is not choosing a command: the menu stays up
              // so the next one can be flipped without reopening it.
              <InlineDropdownMenuToggleItem
                key={item.id}
                checked={preferences.values[item.id]}
                onToggle={() => preferences.set(item.id, !preferences.values[item.id])}
                title={t(item.hintKey)}
                badge={
                  item.shortcut ? (
                    <MenuShortcut>{formatShortcutKeys(item.shortcut).join('+')}</MenuShortcut>
                  ) : undefined
                }
                aria-keyshortcuts={item.shortcut ? ariaKeyShortcut(item.shortcut) : undefined}
                data-testid={`preference-${item.id}`}
              >
                {t(item.labelKey)}
              </InlineDropdownMenuToggleItem>
            ))}
          </Fragment>
        ))}
      </InlineDropdownMenuSubContent>
    </InlineDropdownMenuSub>
  );
}
